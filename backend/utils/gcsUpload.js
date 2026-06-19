const multer = require('multer');
const { bucket, getSignedImageUrl } = require('../config/gcs');

// Buffer in memory instead of writing straight to Cloudinary's storage adapter —
// we stream the buffer to GCS ourselves below.
const uploadMenuImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
}).single('image');

/**
 * Upload a buffer to the private GCS bucket.
 * Returns { object_path } — NOT a permanent URL, since these objects are
 * private and URLs must be signed fresh on each read (see getSignedImageUrl).
 */
async function saveMenuImage(fileBuffer, originalName) {
  const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const objectPath = `menu/${Date.now()}-${safeName}`;
  const blob = bucket.file(objectPath);

  await new Promise((resolve, reject) => {
    const stream = blob.createWriteStream({ resumable: false, contentType: undefined });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(fileBuffer);
  });

  return { object_path: objectPath };
}

async function deleteImage(objectPath) {
  if (!objectPath) return;
  try {
    await bucket.file(objectPath).delete();
  } catch (err) {
    console.error('GCS delete error:', err.message);
  }
}

/**
 * Attach a fresh signed `url` to a menu item (or array of items) for the
 * response — call this right before res.json(), never store the result.
 */
async function withSignedUrl(item) {
  if (!item) return item;
  const objectPath = item.image?.object_path;
  const url = objectPath ? await getSignedImageUrl(objectPath) : '';
  return { ...item, image: { ...item.image, url } };
}

async function withSignedUrls(items) {
  return Promise.all(items.map(withSignedUrl));
}

module.exports = { uploadMenuImage, saveMenuImage, deleteImage, withSignedUrl, withSignedUrls };
