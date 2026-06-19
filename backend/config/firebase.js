const admin = require('firebase-admin');

// Initialized once, reused everywhere via require('../config/firebase').
// Runs ALONGSIDE the existing Mongoose connection during the incremental
// migration — only collections that have been ported (e.g. menuItems) use
// Firestore; everything else still uses MongoDB until migrated.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
