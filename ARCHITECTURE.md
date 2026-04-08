# Production-Grade File Storage & Transfer Application Architecture

## STEP 1 — STACK DECISION

**Decision: Node.js (with TypeScript and Fastify)**
_Justification_: Node.js excels at asynchronous I/O and streaming operations natively, making it superior to PHP for handling massive file streams without blocking or consuming excessive memory. The ecosystem provides excellent tools for streams (like built-in streams, specialized multi-part parsers), and TypeScript ensures robust type safety for complex data models.

## STEP 2 — SYSTEM ARCHITECTURE

### High-Level Components

1. **Frontend**: React-based SPA (PWA capabilities for offline resilience), using Web Workers for hashing and chunking.
2. **API Gateway / Backend API**: Node.js (Fastify) for routing, auth, and metadata management.
3. **Storage Tier**: Object Storage API (AWS S3 or Cloudflare R2 compatible), providing virtually infinite scaling.
4. **Database**: PostgreSQL for transactional metadata (users, folders, file records, access control).
5. **Background Workers**: Redis and BullMQ for post-processing (virus scanning, thumbnail generation, cleanup).

### Architecture Diagram

```ascii
    [ Mobile / iPhone / Web Client ] <==== 1. Metadata / Auth (JWT)
            |   |                              |
            |   | (2. Presigned URL)           v
            |   |                        [ API Server (Node.js/Fastify) ]
            |   |                              |       |
            |   | (3. Chunked Upload)          |       v
            |   v                              |   [ PostgreSQL Database ]
            | [ Object Storage (S3/R2) ]       |       ^
            |       ^                          |       |
            |       |                          |       |
    (4. Notify Complete) <=====================|       |
                                                       |
                                            [ Background Workers (BullMQ) ]
                                            - Thumbnail Generation
                                            - Virus Scanning Hook
                                            - Chunk Cleanup
```

### Data Flow

1. **Init**: Client requests upload initialization. API creates a DB record (status: pending) and returns a unique Upload ID.
2. **Chunking**: For large files, API returns S3 Multipart Upload endpoints (signed S3 URLs) for each part.
3. **Upload**: Client uploads chunks directly to Object Storage (bypassing backend memory/CPU limits).
4. **Merge/Complete**: Client notifies the API that all chunks are uploaded. S3 merges the chunks. API updates the DB (status: active).

## STEP 4 — PERFORMANCE ENGINEERING

- **Direct-to-Disk / S3 Streaming**: The backend acts _only_ as a metadata broker. Files travel directly from the client to the storage layer via pre-signed S3 endpoints. If the backend MUST handle the file, native Node.js streams pipe data directly to disk without loading chunks into RAM.
- **Backpressure Handling**: By utilizing Node.js Streams and Fastify’s multi-part support, the server respects the TCP window, slowing down the client when disk IO is saturated.
- **Concurrent Upload Control**: Frontend uses a concurrency pool (e.g. `p-limit`) to upload exactly 3-4 chunks at a time, saturating network bandwidth without overwhelming the browser or exhausting TCP connections.
- **Rate Limiting**: Redis-backed rate limiting per IP and User ID prevents DDoS and quota abuse.

## STEP 5 — MOBILE + IPHONE SUPPORT

- **iOS Background Limitations**: Safari strictly suspends JS execution when minimized. We rely on the Page Visibility API (`visibilitychange` event) to detect backgrounding.
- **Workaround Strategy**:
  - Pause unstarted chunk uploads immediately when backgrounded.
  - Rely on `Service Workers` and `Background Fetch API` (where supported) or immediately persist chunk state (ETags, offsets) to `IndexedDB`.
  - On resumption (`foreground`), hydrate state from `IndexedDB`, verify S3 parts uploaded successfully, and resume upload from the exact missing chunk.

## STEP 6 — RELIABILITY SYSTEM

- **Retry Logic**: Exponential backoff inside the chunk queue on the client.
- **Integrity**: Web Worker calculates SHA-256 (or fast xxHash) incrementally during read. The final hash is checked against the S3 ETag/Checksum.
- **Checkpointing**: Upload state (file metadata, chunk sizes, completed parts) is written to `localStorage/IndexedDB`.

## STEP 7 — STORAGE STRATEGY

**Decision: Cloudflare R2 / S3 API Compatible Cloud Storage**
_Justification_: Using an S3-compatible backend completely frees the Node.js server from dealing with scalable storage and replication. Using presigned URLs for multi-part uploads means clients stream _directly_ to the edge nearest to them. The backend never buffers the multi-gigabyte files.

## STEP 8 — SECURITY

- **Validation**: Frontend magic-number validation + backend Mime type checking.
- **Virus Scan Hook**: BullMQ task fetches the file from S3 to an isolated container, scans via ClamAV, and marks safe/unsafe in DB.
- **Auth & Access**: Short-lived JWTs. Download links are S3 Presigned GET URLs with an expiration limit.

## STEP 10 — ADVANCED FEATURES

- **Live Progress**: Not necessary for direct S3 uploads as the client tracks its own chunk progress, but SSE is used for notifying clients of background job status (virus scan complete, thumbnail ready).
- **File Deduplication**: Global file hashing checks S3 object ETags before uploading. If a hash exists, we simply create a new DB symlink to the S3 object (saving space).
