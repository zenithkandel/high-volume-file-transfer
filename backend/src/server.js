const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') }); // Load optional parent directory .env
require('dotenv').config(); // Fallback to local ./backend/.env if it exists

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const uploadRoutes = require('./routes/upload');
const { initDb } = require('./utils/db');
const fastifyStatic = require('@fastify/static');

// Ensure local directories exist
const storagePath = path.resolve(process.env.STORAGE_PATH || './uploads');
if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
const tempPath = path.join(storagePath, 'temp');
if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

initDb();

const server = Fastify({
  logger: true,
  bodyLimit: 104857600
});

server.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
});

server.register(fastifyStatic, {
  root: path.join(__dirname, '../../frontend'),
  prefix: '/'
});

server.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB chunk limit

server.register(uploadRoutes, { prefix: '/api/v1/upload' });

server.get('/health', async (request, reply) => {
  return { status: 'ok', time: new Date() };
});

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Server listening on ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
