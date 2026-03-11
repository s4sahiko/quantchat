const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// 1. issueQuantCNumber (HTTPS callable)
exports.issueQuantCNumber = functions.https.onCall(async (data, context) => {
  const { keyHash, ptype, pvalHash, truncatedIP, userAgent } = data;

  let qcNumber = '';
  let attempts = 0;
  let success = false;

  while (attempts < 10 && !success) {
    const randomNum = Math.floor(1000000000 + Math.random() * 9000000000);
    qcNumber = `QC-${randomNum}`;

    await db.runTransaction(async (transaction) => {
      const activeRef = db.collection('active_numbers').doc(qcNumber);
      const burnedRef = db.collection('burned_numbers').doc(qcNumber);

      const activeSnap = await transaction.get(activeRef);
      const burnedSnap = await transaction.get(burnedRef);

      if (!activeSnap.exists && !burnedSnap.exists) {
        transaction.set(activeRef, { issuedAt: admin.firestore.FieldValue.serverTimestamp() });
        transaction.set(db.collection('accounts').doc(qcNumber), {
          qc: qcNumber,
          keyHash,
          ptype,
          pvalHash,
          contacts: [],
          nicks: {},
          selfNick: '',
          autoDelete: 'off',
          notes: [],
          loginHistory: [],
          ssEvents: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          truncatedIP,
          userAgent
        });
        success = true;
      }
    });
    attempts++;
  }

  if (!success) {
    throw new functions.https.HttpsError('resource-exhausted', 'Failed to issue a unique number after 10 attempts.');
  }

  return { qcNumber };
});

// 2. autoDeleteSeenMessages (Firestore trigger)
exports.autoDeleteSeenMessages = functions.firestore
  .document('messages/{chatId}/msgs/{messageId}')
  .onUpdate(async (change, context) => {
    const data = change.after.data();
    if (data.seenBySender === true && data.seenByRecipient === true) {
      const { chatId, messageId } = context.params;
      await change.after.ref.delete();
      console.log(`Auto-deleted seen message: ${messageId} in chat ${chatId}`);
    }
  });

// 3. expireStatuses (Scheduled — runs every hour)
exports.expireStatuses = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
  const now = admin.firestore.Timestamp.now();
  const expiredSnap = await db.collection('statuses').where('expiresAt', '<', now).get();
  
  const batch = db.batch();
  expiredSnap.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`Expired ${expiredSnap.size} statuses.`);
});

// 4. expireTimedMessages (Scheduled — runs every 15 minutes)
exports.expireTimedMessages = functions.pubsub.schedule('every 15 minutes').onRun(async (context) => {
  const now = admin.firestore.Timestamp.now();
  // This would need to iterate through all message sub-collections.
  // Firestore doesn't support collection group queries with sub-collection path filtering easily for deletion.
  // In a real production app, we'd use a more scalable approach.
  // For now, we'll use a collection group query if indexes are set.
  const expiredSnap = await db.collectionGroup('msgs').where('autoDeleteAt', '<', now).get();
  
  const batch = db.batch();
  expiredSnap.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`Expired ${expiredSnap.size} timed messages.`);
});

// 5. eraseQuantCIdentity (HTTPS callable)
exports.eraseQuantCIdentity = functions.https.onCall(async (data, context) => {
  const { qcNumber, keyHash, pvalHash } = data;

  const accountRef = db.collection('accounts').doc(qcNumber);
  const accountSnap = await accountRef.get();

  if (!accountSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Account not found.');
  }

  const accountData = accountSnap.data();
  if (accountData.keyHash !== keyHash || accountData.pvalHash !== pvalHash) {
    throw new functions.https.HttpsError('permission-denied', 'Verification failed.');
  }

  const batch = db.batch();

  // Delete account
  batch.delete(accountRef);
  batch.delete(db.collection('active_numbers').doc(qcNumber));
  batch.set(db.collection('burned_numbers').doc(qcNumber), { burnedAt: admin.firestore.FieldValue.serverTimestamp() });

  // Log erasure
  batch.set(db.collection('erasure_log').doc(), {
    truncatedIP: accountData.truncatedIP || 'unknown',
    userAgent: accountData.userAgent || 'unknown',
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();
  
  // Note: Deleting all messages and removing from contacts would require more complex logic 
  // (e.g. collection group queries and iterating through all accounts).
  // In a real production app, this would be handled by a background worker or multiple batches.
  
  return { success: true };
});
