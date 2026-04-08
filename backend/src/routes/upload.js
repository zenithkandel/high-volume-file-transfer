const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const { readDb, writeDb } = require('../utils/db');

async function uploadRoutes(fastify, options) {
  const getTempPath = () => path.join(path.resolve(process.env.STORAGE_PATH || '../uploads'), 'temp');
  const getStoragePath = () => path.resolve(process.env.STORAGE_PATH || '../uploads');

  fastify.get('/list', async (request, reply) => {
    const db = readDb();
    const result = Object.values(db.files).filter(f => f.status === 'complete').map(f => ({
      id: f.id, filename: f.filename, size: f.size, mimeType: f.mimeType, createdAt: f.createdAt
    }));
    reply.send(result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  });

  fastify.get('/download/:fileId', async (request, reply) => {
    const { fileId } = request.params;
    const db = readDb();
    const fileRecord = db.files[fileId];
    if (!fileRecord || fileRecord.status !== 'complete' || !fs.existsSync(fileRecord.finalPath)) return reply.code(404).send({ error: 'Not found' });
    const stream = fs.createReadStream(fileRecord.finalPath);
    reply.header('Content-Disposition', "attachment; filename="`${fileRecord.filename}`"");
    reply.header('Content-Type', fileRecord.mimeType || 'application/octet-stream');
    return reply.send(stream);
  });

  fastify.post('/zip', async (request, reply) => {
    const { fileIds } = request.body;
    if (!fileIds || !fileIds.length) return reply.code(400).send({ error: 'No files' });
    const db = readDb();
    const archive = archiver('zip', { zlib: { level: 4 } });
    reply.header('Content-Disposition', 'attachment; filename="bundle.zip"');
    reply.header('Content-Type', 'application/zip');
    for (const id of fileIds) {
      const r = db.files[id];
      if (r && r.status === 'complete' && fs.existsSync(r.finalPath)) archive.file(r.finalPath, { name: r.filename });
    }
    archive.finalize();
    return reply.send(archive);
  });

  fastify.post('/init', async (request, reply) => {
    const { filename, mimeType, size, chunksCount } = request.body;
    const fileId = uuidv4();
    const db = readDb();
    db.files[fileId] = { id: fileId, filename, mimeType, size, chunksCount, uploadedChunks: [], status: 'pending', createdAt: new Date().toISOString() };
    writeDb(db);
    const fileTempDir = path.join(getTempPath(), fileId);
    if (!fs.existsSync(fileTempDir)) fs.mkdirSync(fileTempDir, { recursive: true });
    reply.send({ fileId });
  });

  fastify.post('/chunk', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No chunk' });
    const fileId = data.fields.fileId.value;
    const partNumber = parseInt(data.fields.partNumber.value, 10);
    const db = readDb();
    const fileRecord = db.files[fileId];
    if (!fileRecord) return reply.code(404).send({ error: 'Not found' });
    const chunkPath = path.join(getTempPath(), fileId, partNumber.toString());
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
    const f = db.files[fileId];
    if (!f) return reply.code(404).send({ error: 'Not found' });
    if (f.uploadedChunks.length !== f.chunksCount) return reply.code(400).send({ error: 'Missing chunks' });
    const ext = path.extname(f.filename);
    const name = path.basename(f.filename, ext) + '_' + fileId.substr(0, 5) + ext;
    const fPath = path.join(getStoragePath(), name);
    const fStream = fs.createWriteStream(fPath);
    const fileTempDir = path.join(getTempPath(), fileId);
    try {
      for (let i = 1; i <= f.chunksCount; i++) {
        const cPath = path.join(fileTempDir, i.toString());
        await pipeline(fs.createReadStream(cPath), fStream, { end: false });
      }
      fStream.end();
      fs.rmSync(fileTempDir, { recursive: true, force: true });
      f.status = 'complete';
      f.finalPath = fPath;
      writeDb(db);
      reply.send({ success: true, fileId });
    } catch (e) { request.log.error(e); reply.code(500).send({ error: 'Merge failed' }); }
  });
}
module.exports = uploadRoutes;
