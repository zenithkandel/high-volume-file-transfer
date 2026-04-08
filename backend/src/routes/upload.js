const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { v4: uuidv4 } = require('uuid');
const { readDb, writeDb } = require('../utils/db');

async function uploadRoutes(fastify, options) {
  
  const getTempPath = () => path.join(path.resolve(process.env.STORAGE_PATH || './uploads'), 'temp');
  
  fastify.post('/init', async (request, reply) => {
    const { filename, mimeType, size, chunksCount } = request.body;
    
    const fileId = uuidv4();
    const db = readDb();
    
    db.files[fileId] = {
      id: fileId,
      filename,
      mimeType,
      size,
      chunksCount,
      uploadedChunks: [],
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    writeDb(db);
    
    const fileTempDir = path.join(getTempPath(), fileId);
    if (!fs.existsSync(fileTempDir)) {
      fs.mkdirSync(fileTempDir, { recursive: true });
    }
    
    reply.send({ fileId });
  });

  // We use multipart for chunk uploads now
  fastify.post('/chunk', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      reply.code(400).send({ error: 'No file chunk provided' });
      return;
    }

    const fileId = data.fields.fileId.value;
    const partNumber = parseInt(data.fields.partNumber.value, 10);

    const db = readDb();
    const fileRecord = db.files[fileId];
    
    if (!fileRecord) {
      reply.code(404).send({ error: 'File upload not found' });
      return;
    }

    const chunkPath = path.join(getTempPath(), fileId, partNumber.toString());
    
    // Pipe multipart stream directly to disk
    await pipeline(data.file, fs.createWriteStream(chunkPath));

    if (!fileRecord.uploadedChunks.includes(partNumber)) {
      fileRecord.uploadedChunks.push(partNumber);
      fileRecord.status = 'uploading';
      writeDb(db);
    }

    reply.send({ success: true, uploadedChunks: fileRecord.uploadedChunks.length });
  });

  fastify.post('/complete', async (request, reply) => {
    const { fileId } = request.body;
    const db = readDb();
    const fileRecord = db.files[fileId];
    
    if (!fileRecord) {
      reply.code(404).send({ error: 'Upload not found' });
      return;
    }

    if (fileRecord.uploadedChunks.length !== fileRecord.chunksCount) {
      reply.code(400).send({ error: 'Missing chunks, cannot complete.', partsFound: fileRecord.uploadedChunks.length, expected: fileRecord.chunksCount });
      return;
    }

    const finalDir = path.resolve(process.env.STORAGE_PATH || './uploads');
    const ext = path.extname(fileRecord.filename);
    const base = path.basename(fileRecord.filename, ext);
    const finalName = base + '_' + fileId.substr(0, 5) + ext;
    const finalPath = path.join(finalDir, finalName);
    
    const finalStream = fs.createWriteStream(finalPath);
    const fileTempDir = path.join(getTempPath(), fileId);

    try {
      // Concat all chunks in order
      for (let i = 1; i <= fileRecord.chunksCount; i++) {
        const chunkPath = path.join(fileTempDir, i.toString());
        const chunkStream = fs.createReadStream(chunkPath);
        await pipeline(chunkStream, finalStream, { end: false });
      }
      
      finalStream.end();
      fs.rmSync(fileTempDir, { recursive: true, force: true });
      
      fileRecord.status = 'complete';
      fileRecord.finalPath = finalPath;
      writeDb(db);
      
      reply.send({ success: true, fileId, key: finalName });
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed merging chunks ' });
    }
  });
}

module.exports = uploadRoutes;
