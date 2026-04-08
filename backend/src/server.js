const fs = require('fs');
const path = require('path');

// Global error handlers so Passenger actually points out what breaks during startup
process.on('uncaughtException', (err) => {
  console.error("FATAL UNCAUGHT EXCEPTION: ", err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error("UNHANDLED REJECTION: ", reason);
});

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

// A hook to log EXACTLY what URL and path Fastify is seeing
server.addHook('onRequest', (request, reply, done) => {
  server.log.info(`INCOMING REQUEST: ${request.method} ${request.url} (raw: ${request.raw.url})`);
  done();
});

// Force basePath to '/jas/' because cPanel might have NODE_ENV set to 'development' instead of 'production'
const basePath = '/jas/';

server.register(fastifyStatic, {
  root: path.join(__dirname, '../../frontend'),
  prefix: basePath,
  list: true // Optional: helps debug if files are there
});

server.register(uploadRoutes, { prefix: `${basePath}api/v1/upload`.replace('//', '/') });

server.get(`${basePath}health`.replace('//', '/'), async (request, reply) => {
  return { status: 'ok', time: new Date() };
});

// Catch-all to redirect root to the base path if needed
if (basePath !== '/') {
  server.get('/', async (request, reply) => {
    reply.redirect(basePath);
  });
}

const start = async () => {
  try {
    const port = process.env.PORT || 3000;

    // cPanel (Phusion Passenger) might pass a named pipe (string) instead of a numeric port
    if (typeof port === 'string' && isNaN(Number(port))) {
      await server.listen({ path: port });
    } else {
      await server.listen({ port: Number(port), host: '0.0.0.0' });
    }

    server.log.info(`Server listening on ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
