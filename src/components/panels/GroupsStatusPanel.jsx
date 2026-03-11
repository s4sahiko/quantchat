import React, { useState, useEffect } from 'react';
import { collections, onSnapshot, query, orderBy, addDoc, serverTimestamp, handleFirestoreError, OperationType, deleteDoc, doc, updateDoc } from '../../firebase/firestore';
import { Shield, Globe, Plus, Clock, Eye, Heart, MessageCircle, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function GroupsStatusPanel({ user }) {
  const [activeTab, setActiveTab] = useState('status'); // status | groups
  const [statuses, setStatuses] = useState([]);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [contacts, setContacts] = useState([]);
  const [blocked, setBlocked] = useState([]);

  useEffect(() => {
    if (!user) return;

    const unsubContacts = onSnapshot(collections.contacts(user.qc), (snap) => {
      setContacts(snap.docs.map(d => d.id));
    });

    const unsubAccount = onSnapshot(doc(collections.accounts, user.qc), (snap) => {
      if (snap.exists()) {
        setBlocked(snap.data().blocked || []);
      }
    });

    const unsub = onSnapshot(
      query(collections.statuses, orderBy('createdAt', 'desc')),
      (snap) => {
        setStatuses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'statuses');
      }
    );
    return () => {
      unsub();
      unsubContacts();
      unsubAccount();
    };
  }, [user]);

  const handlePostStatus = async () => {
    if (!newStatus.trim()) return;
    try {
      await addDoc(collections.statuses, {
        qc: user.qc,
        text: newStatus,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        viewCount: 0,
        reactions: {}
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, 'statuses'));
      setNewStatus('');
      setIsAddingStatus(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteStatus = async (statusId) => {
    try {
      await deleteDoc(doc(collections.statuses, statusId));
    } catch (e) {
      console.error("Delete failed, attempting soft delete", e);
      try {
        await updateDoc(doc(collections.statuses, statusId), { deleted: true });
      } catch (err) {
        console.error("Soft delete failed", err);
      }
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex border-b border-border bg-bg2 sticky top-0 z-10">
        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 py-3 md:py-4 font-display text-[10px] md:text-xs tracking-widest transition-all ${activeTab === 'status' ? 'text-cyan border-b-2 border-cyan bg-cyan/5' : 'text-muted hover:text-text'
            }`}
        >
          NETWORK STATUS
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`flex-1 py-3 md:py-4 font-display text-[10px] md:text-xs tracking-widest transition-all ${activeTab === 'groups' ? 'text-cyan border-b-2 border-cyan bg-cyan/5' : 'text-muted hover:text-text'
            }`}
        >
          SECURE GROUPS
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        {activeTab === 'status' ? (
          <div className="max-w-2xl mx-auto space-y-6 md:space-y-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-display text-cyan uppercase">Global Broadcasts</h3>
              <button
                onClick={() => setIsAddingStatus(true)}
                className="p-1.5 md:p-2 border border-cyan text-cyan rounded hover:bg-cyan/10 transition-all"
              >
                <Plus size={18} className="md:w-5 md:h-5" />
              </button>
            </div>

            {isAddingStatus && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-bg2 border border-cyan/30 p-4 rounded-lg space-y-4"
              >
                <textarea
                  placeholder="WHAT IS YOUR STATUS? (MAX 300 CHARS)"
                  maxLength={300}
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full bg-bg3 border-border resize-none text-xs"
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsAddingStatus(false)} className="px-3 py-1 text-[10px] font-mono text-muted uppercase">Cancel</button>
                  <button onClick={handlePostStatus} className="px-4 py-1 bg-cyan text-bg font-display text-[10px] uppercase">Broadcast</button>
                </div>
              </motion.div>
            )}

            <div className="space-y-4">
              {statuses.filter(s => !s.deleted && (s.qc === user.qc || contacts.includes(s.qc)) && !blocked.includes(s.qc)).map((status) => (
                <div key={status.id} className="bg-bg2 border border-border p-4 rounded-lg relative overflow-hidden group">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full border border-cyan/30 flex items-center justify-center bg-bg">
                        <Shield size={14} className="text-cyan" />
                      </div>
                      <div>
                        <p className="text-[10px] font-display text-cyan">{status.qc}</p>
                        <p className="text-[8px] font-mono text-muted uppercase">
                          {status.createdAt?.toDate().toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {status.qc === user.qc && (
                      <button
                        onClick={() => handleDeleteStatus(status.id)}
                        className="text-muted hover:text-red md:opacity-0 group-hover:opacity-100 transition-all p-1"
                        title="Delete Broadcast"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs font-mono text-text/90 leading-relaxed mb-4">
                    {status.text}
                  </p>
                  <div className="flex items-center gap-4 text-[10px] font-mono text-muted">
                    <span className="flex items-center gap-1"><Eye size={12} /> {status.viewCount}</span>
                    <span className="flex items-center gap-1"><Heart size={12} /> {Object.keys(status.reactions || {}).length}</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> 12H EXPIRE</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-12">
            <Globe size={48} className="text-border mb-4" />
            <h3 className="text-lg font-display text-muted uppercase mb-2">Group Protocol Offline</h3>
            <p className="text-xs font-mono text-muted/50 max-w-xs uppercase tracking-widest">
              Multi-party secure channels are currently being optimized.
              Direct peer-to-peer communication is the only authorized protocol.
            </p>
            <button className="mt-8 px-6 py-2 border border-border text-muted font-display text-xs uppercase cursor-not-allowed">
              Create Secure Group
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
