const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'missing_key',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'missing_secret',
  },
  endpoint: process.env.AWS_ENDPOINT, // Optional, for Cloudflare R2 / MinIO
});

const BUCKET = process.env.AWS_BUCKET || 'my-app-storage';

async function initMultipartUpload(key, mimeType) {
  const command = new CreateMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: mimeType,
  });
  const response = await s3Client.send(command);
  return response.UploadId;
}

async function getPresignedPartUrl(key, uploadId, partNumber) {
  const command = new UploadPartCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  // URL expires in 1 hour
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

async function completeMultipartUpload(key, uploadId, parts) {
  const command = new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts, // format: [{ ETag: '"string"', PartNumber: 1 }]
    },
  });
  return s3Client.send(command);
}

module.exports = {
  initMultipartUpload,
  getPresignedPartUrl,
  completeMultipartUpload
};
