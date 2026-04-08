# High-Volume File Transfer 🚀

A production-grade, heavy-duty file storage and transfer web application designed as a self-hostable alternative to WeTransfer / Google Drive.

## Step 9: Final Implementation Checklist

✅ Scaffolded Node.js backend using Fastify and AWS SDK
✅ SQL Schema for PostgreSQL including Folders, Files, File Chunks, and File Shares (Schema in `backend/schema.sql`)
✅ Robust chunk-upload system that uploads chunks concurrently in parallel using S3 Presigned URLs (`backend/src/routes/upload.js`)
✅ Vanilla JS Frontend with a `ChunkUploader` class (`frontend/src/utils/ChunkUploader.js`) handling iOS visibility constraints, pause/resume mechanisms, exponential backoff retries, and offline support using LocalStorage caching.

## Deployment Guide 🌍

### Infrastructure Requirements

- **Compute**: AWS ECS / EKS or DigitalOcean App Platform (Node.js servers scaled horizontally)
- **Database**: Managed PostgreSQL 15+ (e.g., AWS RDS, Neon, Supabase)
- **Cache / Message Broker**: Redis (for BullMQ queues and rate-limiting)
- **Storage**: Cloudflare R2 or AWS S3

### Start-up Commands

_Assuming `.env` is configured with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET`_

```bash
cd backend
npm install fastify @fastify/cors @fastify/multipart @aws-sdk/client-s3 @aws-sdk/s3-request-presigner uuid
npm start
```

For the frontend, serve the HTML via any static host (Nginx, Vercel, Netlify):

```bash
cd frontend
npx serve
```

## Scaling Strategy 📈

This architecture was specifically designed for massive scale:

1. **Horizontal Scaling of Backend**: Since the backend ONLY brokers S3 Signed URLs and metadata, it is entirely stateless (besides Redis/DB). You can spin up 100 NodeJS fastify instances behind an Application Load Balancer without any storage bottleneck.
2. **Direct-to-S3 Uploads**: Files never touch your Node.js servers. The frontend streams chunks directly to Cloudflare R2 / AWS S3. This eliminates the need for expensive memory or massive network bandwidth on the API servers.
3. **Chunked Uploads & Concurrent Retries**: By splitting 2GB files into 5MB blocks and uploading 3 at a time, network bandwidth is saturated, saving the upload process from single large-file HTTP timeout errors.
4. **Database Indexing**: The `schema.sql` relies on B-Tree indexes on `share_token` and `user_id` preventing table scans globally.

## Mobile & iPhone Support Strategy

Browsers on iOS rigidly pause execution when the background is lost, making long uploads frail.
Our implementation fixes this using the `visibilitychange` API. When minimized, `ChunkUploader` immediately marks inflight chunk requests to LocalStorage (or IndexedDB). Upon restoring the app, it pulls state, checks which parts S3 returned an `ETag` for, and dynamically continues where the user left off.
