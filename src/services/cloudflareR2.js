const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

let s3Client = null;
let useMock = true;

// Check if all required Cloudflare R2 configurations are provided
const isConfigured = 
  accountId && accountId !== 'YOUR_CLOUDFLARE_ACCOUNT_ID' &&
  accessKeyId && accessKeyId !== 'YOUR_CLOUDFLARE_ACCESS_KEY_ID' &&
  secretAccessKey && secretAccessKey !== 'YOUR_CLOUDFLARE_SECRET_ACCESS_KEY' &&
  bucketName && bucketName !== 'YOUR_CLOUDFLARE_R2_BUCKET_NAME';

if (isConfigured) {
  try {
    s3Client = new S3Client({
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      region: 'auto',
    });
    useMock = false;
    console.log('Cloudflare R2 API client initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Cloudflare R2 client, falling back to Local Mock Storage:', error);
  }
} else {
  console.warn('Cloudflare R2 credentials not fully configured or found. Using Local Mock Storage.');
}

// Local mock directory
const mockDir = path.resolve(process.cwd(), './src/db/mock_storage');
if (useMock && !fs.existsSync(mockDir)) {
  fs.mkdirSync(mockDir, { recursive: true });
}

/**
 * Uploads a file to Cloudflare R2 (or local mock folder).
 * @param {string} filePath Path to local temp file
 * @param {string} fileName Original filename
 * @param {string} mimeType File mime type
 * @returns {Promise<string>} Storage key
 */
async function uploadFile(filePath, fileName, mimeType) {
  if (useMock) {
    const fileId = 'mock-' + Math.random().toString(36).substring(2, 15);
    const destPath = path.join(mockDir, fileId);
    fs.copyFileSync(filePath, destPath);
    console.log(`[Mock R2] Uploaded ${fileName} -> ${fileId}`);
    return fileId;
  }

  try {
    const fileKey = `${Date.now()}-${path.basename(fileName)}`;
    const fileStream = fs.createReadStream(filePath);
    
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      Body: fileStream,
      ContentType: mimeType,
    });

    await s3Client.send(command);
    console.log(`[R2] Uploaded ${fileName} to R2 bucket ${bucketName} as key: ${fileKey}`);
    return fileKey;
  } catch (error) {
    console.error('Cloudflare R2 Upload Error:', error);
    throw error;
  }
}

/**
 * Retrieves a file read stream from Cloudflare R2 (or local mock folder).
 * @param {string} fileKey Key of the file to download
 * @returns {Promise<ReadableStream>} Read stream of the file
 */
async function getFileStream(fileKey) {
  if (useMock || fileKey.startsWith('mock-')) {
    const filePath = path.join(mockDir, fileKey);
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found in Mock Storage');
    }
    return fs.createReadStream(filePath);
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });
    
    const response = await s3Client.send(command);
    // In SDK v3 on Node.js, response.Body is a Node.js ReadableStream
    return response.Body;
  } catch (error) {
    console.error('Cloudflare R2 Download/Stream Error:', error);
    throw error;
  }
}

/**
 * Deletes a file from Cloudflare R2 (or local mock folder).
 * @param {string} fileKey Key of the file to delete
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function deleteFile(fileKey) {
  if (useMock || fileKey.startsWith('mock-')) {
    const filePath = path.join(mockDir, fileKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });
    
    await s3Client.send(command);
    console.log(`[R2] Deleted file key: ${fileKey} from R2`);
    return true;
  } catch (error) {
    console.error('Cloudflare R2 Delete Error:', error);
    return false;
  }
}

module.exports = {
  uploadFile,
  getFileStream,
  deleteFile,
  isMock: () => useMock
};
