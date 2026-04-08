const s3 = require('../services/s3Service');
const { v4: uuidv4 } = require('uuid');
// In a real app we would use Postgres / TypeORM here
const mockDb = new Map();

async function uploadRoutes(fastify, options) {
  
  // 1. Initialize Upload
  fastify.post('/init', async (request, reply) => {
    const { filename, mimeType, size, chunksCount } = request.body;
    
    // Validate size against rate limits / quotas here
    if (size > 10737418240) { // >10GB
      reply.code(413).send({ error: 'Payload Too Large. Max size 10GB.' });
      return;
    }

    const fileId = uuidv4();
    const objectKey = `uploads/${fileId}/${filename}`;
    
    try {
      const uploadId = await s3.initMultipartUpload(objectKey, mimeType);
      
      // Store pending file in DB
      mockDb.set(fileId, {
        objectKey,
        uploadId,
        size,
        chunksCount,
        parts: [],
        status: 'pending', // pending, uploading, complete
      });

      reply.send({ fileId, uploadId, key: objectKey });
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed to init multipart upload' });
    }
  });

  // 2. Get Presigned URL for Chunk
  fastify.post('/get-chunk-url', async (request, reply) => {
    const { fileId, partNumber } = request.body;
    
    const fileRecord = mockDb.get(fileId);
    if (!fileRecord || fileRecord.status === 'complete') {
      reply.code(404).send({ error: 'Upload not found or already completed.' });
      return;
    }

    try {
      const url = await s3.getPresignedPartUrl(fileRecord.objectKey, fileRecord.uploadId, partNumber);
      reply.send({ url });
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed to generate part url' });
    }
  });

  // 3. Optional: Store Chunk ETag on successful PUT (handled mostly by frontend sending final list, but good for resuming)
  fastify.post('/save-chunk', async (request, reply) => {
    const { fileId, partNumber, eTag } = request.body;
    const fileRecord = mockDb.get(fileId);
    
    if (fileRecord) {
      fileRecord.parts.push({ PartNumber: partNumber, ETag: eTag });
      fileRecord.status = 'uploading';
      mockDb.set(fileId, fileRecord);
      reply.send({ success: true, uploadedChunks: fileRecord.parts.length });
    } else {
      reply.code(404).send({ error: 'File id not found' });
    }
  });

  // 4. Complete Upload (Merge chunks)
  fastify.post('/complete', async (request, reply) => {
    const { fileId } = request.body;
    const fileRecord = mockDb.get(fileId);
    
    if (!fileRecord) {
      reply.code(404).send({ error: 'Upload not found' });
      return;
    }

    // Sort parts to ensure S3 processes them correctly
    const sortedParts = fileRecord.parts.sort((a, b) => a.PartNumber - b.PartNumber);
    
    // Check if we have all chunks
    if (sortedParts.length !== fileRecord.chunksCount) {
      reply.code(400).send({ error: 'Missing chunks. Please retry failed chunks.', partsFound: sortedParts.length, expected: fileRecord.chunksCount });
      return;
    }

    try {
      // Tell S3 to merge all the uploaded parts
      await s3.completeMultipartUpload(fileRecord.objectKey, fileRecord.uploadId, sortedParts);
      
      fileRecord.status = 'complete';
      mockDb.set(fileId, fileRecord);

      // Trigger background worker via BullMQ queue (Virus Scan, Thumbnails)
      // queue.add('post-process', { fileId, key: fileRecord.objectKey });

      reply.send({ success: true, fileId, key: fileRecord.objectKey });
    } catch (err) {
      request.log.error(err);
      // Implement fallback / abort logic or wait for retry
      reply.code(500).send({ error: 'Failed to complete multipart upload S3 side' });
    }
  });
}

module.exports = uploadRoutes;
