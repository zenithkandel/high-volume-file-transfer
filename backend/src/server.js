const Fastify = require('fastify');
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const uploadRoutes = require('./routes/upload');

const server = Fastify({ 
  logger: true,
  bodyLimit: 104857600 // 100MB body limit (not for S3 direct, but for JSON metadata)
});

server.register(cors, {
  origin: '*', // For production, restrict to frontend domain
  methods: ['GET', 'POST', 'PUT', 'DELETE']
});

server.register(multipart); // useful if we accept direct uploads, but we mostly use S3 signed URLs

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
