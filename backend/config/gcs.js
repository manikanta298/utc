const { Storage } = require('@google-cloud/storage');

const storage = new Storage({
  projectId: process.env.FIREBASE_PROJECT_ID,
  credentials: {
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
});

const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

// Default validity for signed URLs returned to clients. Google Cloud Storage
// caps V4 signed URLs at 7 days regardless of signing method, so we keep this
// well under that and regenerate on every read instead of storing a permanent URL.
const DEFAULT_SIGNED_URL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Generate a short-lived signed URL for a private object.
 * @param {string} objectPath - path within the bucket, e.g. 'menu/12345-pizza.jpg'
 * @param {number} [expiresInMs] - validity window in ms
 */
async function getSignedImageUrl(objectPath, expiresInMs = DEFAULT_SIGNED_URL_MS) {
  if (!objectPath) return '';
  try {
    const [url] = await bucket.file(objectPath).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInMs,
    });
    return url;
  } catch (err) {
    console.error('GCS signed URL error:', err.message);
    return '';
  }
}

module.exports = { bucket, getSignedImageUrl };
