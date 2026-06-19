const { db, admin } = require('../config/firebase');

const COLLECTION = 'menuItems';
const ref = db.collection(COLLECTION);

// Fields and defaults that Mongoose used to enforce via schema. Firestore is
// schemaless, so defaults/validation now live here instead of in a schema file.
const DEFAULTS = {
  description: '',
  hsn_code: '',
  image: { object_path: '' },
  isGlobalActive: true,
  disabledInFranchises: [],
  preparationTime: 10,
  isVeg: true,
  sortOrder: 0,
  stock_enabled: false,
  stock_qty: 0,
  unit: 'pcs',
  low_stock_threshold: 10,
};

function serialize(doc) {
  return { id: doc.id, _id: doc.id, ...doc.data() };
}

/**
 * Mongoose-style find(filter). Supports equality filters only — Firestore
 * `.where()` doesn't support the regex/$or-style queries Mongo allowed, so
 * any such usage elsewhere will need bespoke handling when it's migrated.
 */
async function find(filter = {}) {
  let query = ref;
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined) query = query.where(key, '==', value);
  }
  const snap = await query.get();
  return snap.docs.map(serialize);
}

async function findById(id) {
  if (!id) return null;
  const doc = await ref.doc(id).get();
  return doc.exists ? serialize(doc) : null;
}

async function create(data) {
  const payload = {
    ...DEFAULTS,
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const docRef = await ref.add(payload);
  return findById(docRef.id);
}

async function updateById(id, updates) {
  await ref.doc(id).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return findById(id);
}

async function deleteById(id) {
  await ref.doc(id).delete();
}

module.exports = { find, findById, create, updateById, deleteById, ref };
