import React, { useState, useEffect } from 'react';
import {
  collections,
  onSnapshot,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  handleFirestoreError,
  OperationType
} from '../../firebase/firestore';
import { auth, anonSignIn } from '../../firebase/auth';
import { Shield, Check, X, Bell, UserPlus, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function NotificationsPanel({ user, onClose, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collections.chatRequests,
      where('to', '==', user.qc),
      where('status', '==', 'pending'),
      orderBy('timestamp', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chat_requests');
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const handleAccept = async (request) => {
    console.log('[AUTH] Starting authorization for:', request.from);

    // Robust auth helper — always forces a fresh Firebase token before writes.
    // Retries up to maxAttempts times with a short delay between each attempt.
    const attemptAccept = async (attempt = 1, maxAttempts = 3) => {
      // Always re-establish Firebase session before writing — this is cheap if
      // a session already exists (Firebase returns the cached user immediately).
      try {
        await anonSignIn();
        console.log('[AUTH] Firebase session ready, uid:', auth.currentUser?.uid);
      } catch (authErr) {
        console.warn('[AUTH] anonSignIn failed:', authErr.message);
        // Continue — maybe the session is already valid
      }

      if (!auth.currentUser) {
        if (attempt < maxAttempts) {
          console.warn(`[AUTH] auth.currentUser still null, retrying (${attempt}/${maxAttempts})...`);
          await new Promise(r => setTimeout(r, 500 * attempt));
          return attemptAccept(attempt + 1, maxAttempts);
        }
        throw new Error('Firebase Auth could not be established after multiple attempts.');
      }

      // Fetch public key of the requester
      const fromSnap = await getDoc(doc(collections.accounts, request.from));
      if (!fromSnap.exists()) {
        throw new Error(`Identity not found on network: ${request.from}`);
      }
      const fromPubKey = fromSnap.data()?.publicKeyJwk ?? null;

      console.log('[AUTH] Adding requester to contacts...');

      // Write requester into current user's contacts
      await setDoc(doc(collections.contacts(user.qc), request.from), {
        qc: request.from,
        publicKeyJwk: fromPubKey,
        addedAt: serverTimestamp()
      });

      // Mark the request as accepted — the requester's ChatsPanel listener
      // will detect this and add us to their own contacts (sequential handshake)
      await updateDoc(doc(collections.chatRequests, request.id), {
        status: 'accepted',
        respondedAt: serverTimestamp()
      });

      console.log('[AUTH] Authorization complete.');
      showToast?.(`Secure channel established with ${request.from}`, 'info');
    };

    try {
      await attemptAccept();
    } catch (err) {
      console.error('[AUTH] Authorization failed after retries:', err);
      console.error('[AUTH] auth.currentUser at failure:', auth.currentUser?.uid ?? 'null');
      if (err.code === 'permission-denied') {
        showToast?.('Permission denied — please refresh and try again.', 'error');
      } else if (err.message?.includes('Firebase Auth')) {
        showToast?.('Network issue — could not authenticate. Check your connection.', 'error');
      } else {
        showToast?.(`Authorization failed: ${err.message}`, 'error');
      }
    }
  };

  const handleReject = async (request) => {
    try {
      if (!auth.currentUser) await anonSignIn();
      await updateDoc(doc(collections.chatRequests, request.id), {
        status: 'rejected',
        respondedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('[AUTH] Rejection failed:', err);
      showToast?.('Update failed. Check your connection.', 'error');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg border border-border/50">
      <div className="p-4 border-b border-border bg-bg2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="text-cyan" size={16} />
          <h2 className="text-xs font-display text-cyan uppercase tracking-widest">Inbound Requests</h2>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-bg3 rounded text-muted hover:text-text">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
            <Shield size={48} className="text-border mb-4" />
            <p className="text-xs font-mono text-muted uppercase tracking-widest">No pending authorization requests</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            <AnimatePresence>
              {requests.map((req) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-bg2/60 border border-border/40 p-3 md:p-4 rounded-lg flex items-center justify-between group hover:border-cyan/30 transition-all shadow-md"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 shrink-0 rounded-full border border-cyan/20 flex items-center justify-center bg-bg shadow-inner">
                      <UserPlus size={18} className="text-cyan" />
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[11px] md:text-xs font-display text-cyan tracking-wider truncate">{req.from}</p>
                        <span className="text-[8px] bg-cyan/10 text-cyan px-1.5 py-0.5 rounded uppercase font-mono border border-cyan/20 whitespace-nowrap">New Peer</span>
                      </div>
                      <p className="text-[9px] font-mono text-muted uppercase flex items-center gap-1 opacity-60">
                        <Clock size={10} />
                        {req.timestamp?.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      onClick={() => handleReject(req)}
                      className="p-1 text-muted hover:text-red transition-all"
                      title="Reject Request"
                    >
                      <X size={16} />
                    </button>
                    <button
                      onClick={() => handleAccept(req)}
                      className="px-2.5 py-1.5 bg-cyan text-bg font-display text-[9px] uppercase hover:bg-cyan/80 transition-all shadow-glow-cyan rounded font-bold whitespace-nowrap"
                    >
                      Auth
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="p-4 bg-bg2 border-t border-border">
        <p className="text-[9px] font-mono text-muted text-center uppercase tracking-widest leading-relaxed">
          Authorizing a peer establishes a mutual secure channel. <br />
          Unauthorized requests are isolated and cannot access your identity metadata.
        </p>
      </div>
    </div>
  );
}
