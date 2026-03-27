/**
 * QuantChat Cloud Functions — Corrected
 *
 * PREVIOUS FLAW: Line 4 had `const admin.firestore(...)` — invalid JavaScript
 * syntax. This crashed the entire functions deployment, meaning ALL cloud
 * functions (including eraseQuantCIdentity and autoDeleteSeenMessages) never
 * actually ran in production.
 *
 * FIXES:
 * 1. Correct Firestore initialization with a named database ID.
 * 2. issueQuantCNumber now validates required fields before writing.
 * 3. autoDeleteSeenMessages is a reliable server-side delete trigger
 *    (closes the gap where client-side auto-delete could be bypassed
 *    by simply closing the app before the 5s interval fires).
 * 4. eraseQuantCIdentity now also purges the user's contacts subcollection
 *    and removes them from all other users' contact lists.
 * 5. expireStatuses now hard-deletes properly.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Correct approach for named database using @google-cloud/firestore
const { Firestore } = require('@google-cloud/firestore');
const namedDb = new Firestore({
  projectId: process.env.GCLOUD_PROJECT,
  databaseId: 'ai-studio-c6dc4d45-0b54-40b7-9703-bac80cd29c3f',
});

// ─── 1. issueQuantCNumber ─────────────────────────────────────────────────────
exports.issueQuantCNumber = functions.https.onCall(async (data, context) => {
  const { keyHash, ptype, pvalHash, publicKeyJwk, encryptedPrivateKey } = data;

  // ✅ FIX: Validate all required fields before proceeding
  if (!keyHash || !ptype || !pvalHash || !publicKeyJwk || !encryptedPrivateKey) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required identity fields.');
  }

  if (!['keyword', 'chess'].includes(ptype)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid pattern type.');
  }

  let qcNumber = '';
  let attempts = 0;
  let success = false;

  while (attempts < 10 && !success) {
    const randomNum = Math.floor(1000000000 + Math.random() * 9000000000);
    qcNumber = `QC-${randomNum}`;

    await namedDb.runTransaction(async (transaction) => {
      const activeRef = namedDb.collection('active_numbers').doc(qcNumber);
      const burnedRef = namedDb.collection('burned_numbers').doc(qcNumber);

      const [activeSnap, burnedSnap] = await Promise.all([
        transaction.get(activeRef),
        transaction.get(burnedRef),
      ]);

      if (!activeSnap.exists && !burnedSnap.exists) {
        transaction.set(activeRef, {
          issuedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        transaction.set(namedDb.collection('accounts').doc(qcNumber), {
          qc: qcNumber,
          keyHash,
          ptype,
          pvalHash,
          publicKeyJwk,           // ECDH public key — safe to store openly
          encryptedPrivateKey,     // AES-encrypted private key — safe to store encrypted
          contacts: [],
          notes: [],
          blocked: [],
          autoDelete: 'off',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        success = true;
      }
    });

    attempts++;
  }

  if (!success) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Failed to issue a unique QC number after 10 attempts.'
    );
  }

  return { qcNumber };
});

// ─── 2. autoDeleteSeenMessages ────────────────────────────────────────────────
// ✅ This is the reliable server-side counterpart to the client-side 5s interval.
// Even if a user closes the app immediately after receiving a message,
// this trigger fires server-side and deletes the message from Firestore.
exports.autoDeleteSeenMessages = functions.firestore
  .document('messages/{chatId}/msgs/{messageId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only act when seenByRecipient just flipped to true
    if (!before.seenByRecipient && after.seenByRecipient && after.seenBySender) {
      const { chatId, messageId } = context.params;
      await change.after.ref.delete();
      console.log(`[EAS] Deleted message ${messageId} in chat ${chatId}`);
    }
  });

// ─── 3. expireStatuses ────────────────────────────────────────────────────────
exports.expireStatuses = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const expiredSnap = await namedDb.collection('statuses')
      .where('expiresAt', '<', now)
      .get();

    if (expiredSnap.empty) {
      console.log('[expireStatuses] No expired statuses found.');
      return null;
    }

    // ✅ FIX: Use batches of max 500 (Firestore limit)
    const chunks = [];
    const docs = expiredSnap.docs;
    for (let i = 0; i < docs.length; i += 500) {
      chunks.push(docs.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const batch = namedDb.batch();
      chunk.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    console.log(`[expireStatuses] Deleted ${expiredSnap.size} expired statuses.`);
    return null;
  });

// ─── 4. expireTimedMessages ───────────────────────────────────────────────────
exports.expireTimedMessages = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const expiredSnap = await namedDb.collectionGroup('msgs')
      .where('autoDeleteAt', '<', now)
      .get();

    if (expiredSnap.empty) {
      console.log('[expireTimedMessages] No expired messages found.');
      return null;
    }

    const chunks = [];
    const docs = expiredSnap.docs;
    for (let i = 0; i < docs.length; i += 500) {
      chunks.push(docs.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const batch = namedDb.batch();
      chunk.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    console.log(`[expireTimedMessages] Deleted ${expiredSnap.size} timed messages.`);
    return null;
  });

// ─── 5. eraseQuantCIdentity ───────────────────────────────────────────────────
// ✅ FIX: Now also purges contact subcollection and removes user from
//         all other accounts' contact lists — a complete network purge.
exports.eraseQuantCIdentity = functions.https.onCall(async (data, context) => {
  const { qcNumber, keyHash, pvalHash } = data;

  if (!qcNumber || !keyHash || !pvalHash) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
  }

  const accountRef = namedDb.collection('accounts').doc(qcNumber);
  const accountSnap = await accountRef.get();

  if (!accountSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Account not found.');
  }

  const accountData = accountSnap.data();

  // Verify identity (server-side comparison of provided hashes)
  // In production, use bcrypt.compare server-side here if possible
  if (accountData.keyHash !== keyHash || accountData.pvalHash !== pvalHash) {
    throw new functions.https.HttpsError('permission-denied', 'Verification failed.');
  }

  const batch = namedDb.batch();

  // 1. Delete account document
  batch.delete(accountRef);

  // 2. Move number from active to burned
  batch.delete(namedDb.collection('active_numbers').doc(qcNumber));
  batch.set(namedDb.collection('burned_numbers').doc(qcNumber), {
    burnedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 3. Log erasure (no PII — just timestamp)
  batch.set(namedDb.collection('erasure_log').doc(), {
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // 4. ✅ FIX: Purge contacts subcollection
  const contactsSnap = await namedDb
    .collection(`accounts/${qcNumber}/contacts`)
    .get();

  if (!contactsSnap.empty) {
    const contactBatch = namedDb.batch();
    contactsSnap.docs.forEach(d => contactBatch.delete(d.ref));
    await contactBatch.commit();
  }

  // 5. ✅ FIX: Remove this user from all other accounts' contact lists
  const reverseContactsSnap = await namedDb
    .collectionGroup('contacts')
    .where('qc', '==', qcNumber)
    .get();

  if (!reverseContactsSnap.empty) {
    const chunks = [];
    const rdocs = reverseContactsSnap.docs;
    for (let i = 0; i < rdocs.length; i += 500) {
      chunks.push(rdocs.slice(i, i + 500));
    }
    for (const chunk of chunks) {
      const b = namedDb.batch();
      chunk.forEach(d => b.delete(d.ref));
      await b.commit();
    }
  }

  // 6. Delete all messages in chats involving this user
  for (const field of ['from', 'to']) {
    const msgsSnap = await namedDb
      .collectionGroup('msgs')
      .where(field, '==', qcNumber)
      .get();

    if (!msgsSnap.empty) {
      const chunks = [];
      const mdocs = msgsSnap.docs;
      for (let i = 0; i < mdocs.length; i += 500) {
        chunks.push(mdocs.slice(i, i + 500));
      }
      for (const chunk of chunks) {
        const b = namedDb.batch();
        chunk.forEach(d => b.delete(d.ref));
        await b.commit();
      }
    }
  }

  console.log(`[eraseQuantCIdentity] Fully purged identity: ${qcNumber}`);
  return { success: true };
});
