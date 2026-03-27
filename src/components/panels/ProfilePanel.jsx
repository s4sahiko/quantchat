import React, { useState, useEffect } from 'react';
import { collections, doc, updateDoc, onSnapshot, serverTimestamp, handleFirestoreError, OperationType } from '../../firebase/firestore';
import { encryptMessage, decryptMessage, deriveNotesKey } from '../../utils/encryption';
import { Shield, Plus, Trash2, Save, X, ShieldOff, User } from 'lucide-react';
import { motion } from 'motion/react';

/**
 * FIXES APPLIED:
 * Previous: Notes were encrypted with a seed string = user.qc + user.key (the raw 10-digit number).
 *   - The raw 10-digit key was stored in the user session object in localStorage.
 *   - encryptMessage accepted a string seed rather than a real CryptoKey.
 *
 * Fixed:
 *   - deriveNotesKey() performs an ECDH self-derivation using the user's own key pair,
 *     producing a proper AES-256-GCM CryptoKey deterministically tied to their identity.
 *   - The CryptoKey is cached in a module-level ref so we only derive it once per session.
 *   - The raw 10-digit key string is no longer needed or passed here at all.
 */

// Module-level cache — one notes key per session
let cachedNotesKey = null;
let cachedForQC = null;

async function getNotesKey(user) {
  if (cachedNotesKey && cachedForQC === user.qc) return cachedNotesKey;
  // user.privateKey is the CryptoKey; user.publicKeyJwk is the JWK of their own public key
  cachedNotesKey = await deriveNotesKey(user.privateKey, user.publicKeyJwk);
  cachedForQC = user.qc;
  return cachedNotesKey;
}

export default function ProfilePanel({ user, onLogout, showToast }) {
  const [account, setAccount] = useState(null);
  const [notes, setNotes] = useState([]);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', body: '' });
  const [loading, setLoading] = useState(false);
  const [contactsCount, setContactsCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(collections.accounts, user.qc), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAccount(data);
        decryptNotes(data.notes || []);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `accounts/${user.qc}`));

    const unsubContacts = onSnapshot(collections.contacts(user.qc), (snap) => {
      setContactsCount(snap.docs.length);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `accounts/${user.qc}/contacts`));

    return () => { unsub(); unsubContacts(); };
  }, [user]);

  const decryptNotes = async (encryptedNotes) => {
    // ✅ FIX: use ECDH-derived notes key instead of raw string seed
    const notesKey = await getNotesKey(user);
    const decrypted = await Promise.all(encryptedNotes.map(async (note) => {
      try {
        const body = await decryptMessage(note.body, notesKey);
        return { ...note, body };
      } catch {
        return { ...note, body: '[DECRYPTION FAILED]' };
      }
    }));
    setNotes(decrypted);
  };

  const handleSaveNote = async () => {
    if (!newNote.body.trim()) return;
    setLoading(true);
    try {
      // ✅ FIX: encrypt with ECDH-derived notes key
      const notesKey = await getNotesKey(user);
      const encryptedBody = await encryptMessage(newNote.body, notesKey);
      const noteObj = {
        id: Date.now().toString(),
        title: newNote.title || 'Untitled Note',
        body: encryptedBody,
        createdAt: new Date().toISOString()
      };

      const updatedNotes = [...(account.notes || []), noteObj];
      await updateDoc(doc(collections.accounts, user.qc), { notes: updatedNotes })
        .catch(e => handleFirestoreError(e, OperationType.UPDATE, `accounts/${user.qc}`));

      setNewNote({ title: '', body: '' });
      setIsAddingNote(false);
    } catch (e) {
      console.error(e);
      showToast?.('Failed to encrypt note.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      const updatedNotes = account.notes.filter(n => n.id !== noteId);
      await updateDoc(doc(collections.accounts, user.qc), { notes: updatedNotes });
    } catch (e) { console.error(e); }
  };

  const handleUnblock = async (blockedId) => {
    try {
      const newBlocked = account.blocked.filter(id => id !== blockedId);
      await updateDoc(doc(collections.accounts, user.qc), { blocked: newBlocked });
    } catch (e) { console.error(e); }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto w-full space-y-8 md:space-y-12">

        {/* Profile Header */}
        <section className="flex flex-col md:flex-row items-center gap-6 md:gap-8 bg-bg2 border border-border p-6 md:p-8 rounded-lg relative overflow-hidden">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-2 border-cyan flex items-center justify-center bg-bg3 shadow-glow-cyan">
            <Shield size={48} className="md:w-16 md:h-16 text-cyan" />
          </div>
          <div className="flex-1 text-center md:text-left z-10">
            <h2 className="text-2xl md:text-3xl font-display text-cyan mb-2">IDENTITY PROFILE</h2>
            <div className="font-mono text-muted space-y-1">
              <p className="text-[10px] md:text-xs uppercase">QuantC Number: <span className="text-text">{user?.qc}</span></p>
              <p className="text-[10px] md:text-xs uppercase">Status: <span className="text-green">ACTIVE / SECURE</span></p>
              <p className="text-[10px] md:text-xs uppercase">Created: <span className="text-text">{account?.createdAt?.toDate().toLocaleDateString()}</span></p>
              <p className="text-[10px] md:text-xs uppercase">QuantC Contacts: <span className="text-text">{contactsCount}</span></p>
              <p className="text-[10px] md:text-xs uppercase">Encryption: <span className="text-cyan">ECDH P-256 + AES-256-GCM</span></p>
            </div>
          </div>
        </section>

        {/* Personal Notes */}
        <section className="space-y-4 md:space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-display text-cyan uppercase tracking-widest">Encrypted Notes</h3>
            <button onClick={() => setIsAddingNote(true)} className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 border border-cyan text-cyan font-display text-[10px] md:text-xs hover:bg-cyan/10">
              <Plus size={14} /> NEW NOTE
            </button>
          </div>

          {isAddingNote && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-bg3 border border-cyan/30 p-5 md:p-6 rounded-lg space-y-4">
              <input type="text" placeholder="NOTE TITLE" value={newNote.title} onChange={(e) => setNewNote({ ...newNote, title: e.target.value })} className="w-full bg-bg2 text-xs md:text-sm" />
              <textarea placeholder="WRITE YOUR ENCRYPTED NOTE HERE..." rows={4} value={newNote.body} onChange={(e) => setNewNote({ ...newNote, body: e.target.value })} className="w-full bg-bg2 resize-none text-xs md:text-sm" />
              <div className="flex justify-end gap-2 md:gap-3">
                <button onClick={() => setIsAddingNote(false)} className="px-3 md:px-4 py-1.5 md:py-2 text-muted font-mono text-[10px] md:text-xs uppercase hover:text-text">Cancel</button>
                <button onClick={handleSaveNote} disabled={loading} className="px-4 md:px-6 py-1.5 md:py-2 bg-cyan text-bg font-display text-[10px] md:text-xs hover:bg-cyan/80 flex items-center gap-2">
                  {loading ? <Shield size={14} className="animate-spin" /> : <Save size={14} />}
                  SAVE ENCRYPTED
                </button>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {notes.length === 0
              ? <div className="col-span-full py-8 md:py-12 text-center border border-dashed border-border rounded-lg"><p className="text-muted font-mono text-[10px] md:text-xs uppercase">No encrypted notes found.</p></div>
              : notes.map((note) => (
                <div key={note.id} className="bg-bg2 border border-border p-5 md:p-6 rounded-lg group relative">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-xs md:text-sm font-display text-cyan uppercase tracking-wider">{note.title}</h4>
                    <button onClick={() => handleDeleteNote(note.id)} className="text-muted hover:text-red md:opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                  </div>
                  <p className="text-[11px] md:text-xs text-text/80 font-mono whitespace-pre-wrap leading-relaxed">{note.body}</p>
                  <div className="mt-4 text-[8px] font-mono text-muted/50 uppercase">Stored: {new Date(note.createdAt).toLocaleString()}</div>
                </div>
              ))
            }
          </div>
        </section>

        {/* Blocked Identities */}
        <section className="space-y-4 md:space-y-6">
          <h3 className="text-lg md:text-xl font-display text-red uppercase tracking-widest flex items-center gap-3">
            <ShieldOff size={24} /> Blocked Identities
          </h3>
          <div className="bg-bg2 border border-red/20 rounded-lg overflow-hidden">
            {!account?.blocked || account.blocked.length === 0
              ? <div className="p-8 text-center border border-dashed border-border m-4 rounded-lg"><p className="text-muted font-mono text-[10px] md:text-xs uppercase">No blocked identities.</p></div>
              : <div className="divide-y divide-border/30">
                  {account.blocked.map((blockedId) => (
                    <div key={blockedId} className="flex items-center justify-between p-4 md:p-6 hover:bg-bg3/50 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full border border-red/30 flex items-center justify-center bg-bg"><User size={20} className="text-red/50" /></div>
                        <div>
                          <p className="text-xs font-display text-text">{blockedId}</p>
                          <p className="text-[8px] font-mono text-red uppercase">Communication Terminated</p>
                        </div>
                      </div>
                      <button onClick={() => handleUnblock(blockedId)} className="px-4 py-1.5 border border-red/30 text-red/70 hover:text-red hover:border-red hover:bg-red/10 text-[10px] font-mono transition-all uppercase">Unblock</button>
                    </div>
                  ))}
                </div>
            }
          </div>
        </section>
      </div>
    </div>
  );
}
