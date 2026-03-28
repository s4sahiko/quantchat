import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collections, query, where, orderBy, onSnapshot, addDoc, updateDoc,
  doc, setDoc, getDoc, serverTimestamp, getDocs, limit, handleFirestoreError,
  OperationType, deleteDoc, writeBatch, db, collectionGroup
} from '../../firebase/firestore';
import { rtdbRefs, set, onValue, onDisconnect, remove } from '../../firebase/realtimedb';
import { deriveSharedKey, encryptMessage, decryptMessage } from '../../utils/encryption';
import {
  Search, Send, Ghost, Clock, Check, CheckCheck, Smile, UserPlus,
  ArrowLeft, ShieldAlert, Shield, Trash2, MoreVertical, User as UserIcon,
  ShieldOff, Edit3, Loader2, Reply, X
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import EmojiPicker from '../shared/EmojiPicker';

// ─── SHARED KEY CACHE ──────────────────────────────────────────────────────────
// Keeps derived ECDH keys in memory so we don't re-derive per message.
const sharedKeyCache = {};

async function getOrDeriveSharedKey(myPrivateKey, theirQC, chatId) {
  if (sharedKeyCache[chatId]) return sharedKeyCache[chatId];

  const theirAccountSnap = await getDoc(doc(collections.accounts, theirQC));
  if (!theirAccountSnap.exists()) {
    throw new Error(`Account not found for ${theirQC}`);
  }

  const theirPublicKeyJwk = theirAccountSnap.data().publicKeyJwk;
  if (!theirPublicKeyJwk) {
    throw new Error(`No public key found for ${theirQC}. They may be using an older account version.`);
  }

  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyJwk);
  sharedKeyCache[chatId] = sharedKey;
  return sharedKey;
}

function MessageBubble({ msg, user, onReply }) {
  const isMe = msg.from === user.qc;
  const dragX = useMotionValue(0);
  const iconOpacity = useTransform(dragX, isMe ? [0, -60] : [0, 60], [0, 1]);
  const iconScale = useTransform(dragX, isMe ? [0, -60] : [0, 60], [0.5, 1]);

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} relative overflow-visible py-1 px-2`}>
      <motion.div
        style={{ opacity: iconOpacity, scale: iconScale }}
        className={`absolute inset-y-0 ${isMe ? 'right-0 justify-end' : 'left-0 justify-start'} flex items-center px-4 pointer-events-none z-0`}
      >
        <div className="bg-cyan/20 p-2 rounded-full"><Reply size={18} className="text-cyan" /></div>
      </motion.div>

      <motion.div
        drag="x"
        style={{ x: dragX }}
        dragConstraints={isMe ? { left: -100, right: 0 } : { left: 0, right: 100 }}
        dragElastic={0.2}
        onDragEnd={(e, info) => {
          const threshold = isMe ? -60 : 60;
          const triggered = isMe ? info.offset.x < threshold : info.offset.x > threshold;
          if (triggered) onReply(msg);
          animate(dragX, 0, { type: 'spring', stiffness: 500, damping: 40 });
        }}
        className={`max-w-[85%] p-2 rounded-lg border relative z-10 cursor-grab active:cursor-grabbing touch-pan-y ${isMe ? 'bg-cyan/5 border-cyan/30' : 'bg-bg2 border-border'}`}
      >
        {msg.replyTo && (
          <div className="mb-1.5 p-1.5 rounded bg-bg/50 border-l-2 border-cyan text-[11px] font-mono opacity-70 overflow-hidden">
            <span className="text-cyan text-[8px] uppercase tracking-tighter font-bold block mb-0.5">
              {msg.replyTo.from === user.qc ? 'You' : 'Contact'}
            </span>
            <p className="truncate italic leading-tight font-body text-[13px]">{msg.replyTo.text}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <p className="flex-1 text-[16px] md:text-[18px] font-body leading-relaxed text-text min-w-[50px] py-0.5">{msg.text}</p>
          <div className="flex items-center gap-1 shrink-0 self-end mb-0.5 select-none opacity-60">
            <span className="text-[10px] font-body tracking-tighter">
              {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {isMe && (msg.seenByRecipient
              ? <CheckCheck size={12} className="text-cyan" />
              : <Check size={12} className="text-muted" />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function ChatsPanel({
  user, activeChat, setActiveChat, onChatSelect,
  isAddingContact, setIsAddingContact, onChatStateChange, showToast
}) {
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [typing, setTyping] = useState(false);
  const [recipientTyping, setRecipientTyping] = useState(false);
  const [newContactQC, setNewContactQC] = useState('');
  const [addError, setAddError] = useState('');
  const [account, setAccount] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null);
  const [isConfirmProcessing, setIsConfirmProcessing] = useState(false);
  const [keyError, setKeyError] = useState(null);
  const [unreads, setUnreads] = useState({});
  const menuRef = useRef(null);
  const emojiRef = useRef(null);
  const scrollRef = useRef();
  const inputRef = useRef();

  const normalizeQC = (id) => {
    if (!id) return '';
    const match = id.match(/\d+/);
    return match ? match[0] : id.trim().toUpperCase();
  };

  const chatId = React.useMemo(() => {
    if (!user?.qc || !activeChat?.qc) return null;
    return [normalizeQC(user.qc), normalizeQC(activeChat.qc)].sort().join('__');
  }, [user, activeChat]);

  const handleConfirmAction = async () => {
    if (!confirmConfig || !confirmConfig.onConfirm || isConfirmProcessing) return;

    setIsConfirmProcessing(true);
    const action = confirmConfig.onConfirm;

    try {
      await action();
    } catch (err) {
      console.error('[SYSTEM] Confirmation action failed:', err);
      showToast('System execution failure. Retrying sync...', 'error');
    } finally {
      setConfirmConfig(null);
      setIsConfirmProcessing(false);
    }
  };

  useEffect(() => {
    setRecipientTyping(false);
    setKeyError(null);
    if (onChatStateChange) onChatStateChange(!!activeChat);
  }, [activeChat, onChatStateChange]);

  // Account listener
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(collections.accounts, user.qc), (snap) => {
      if (snap.exists()) setAccount(snap.data());
    });
    let unsubContact = () => {};
    if (activeChat) {
      unsubContact = onSnapshot(doc(collections.contacts(user.qc), activeChat.qc), (snap) => {
        if (snap.exists()) setActiveChat(prev => prev ? { ...prev, ...snap.data() } : null);
      });
    }
    return () => { unsub(); unsubContact(); };
  }, [user, activeChat?.qc]);

  // Auto-delete interval
  useEffect(() => {
    if (!activeChat || !user || !chatId || messages.length === 0) return;
    const interval = setInterval(async () => {
      const protocol = activeChat.autoDelete || 'EAS';
      const thresholds = { EAS: 0, '1MIN': 60000, '10MIN': 600000, '30MIN': 1800000, '1HR': 3600000 };
      const threshold = thresholds[protocol];
      if (threshold === undefined) return;

      for (const msg of messages) {
        if (msg.seenByRecipient && msg.timestamp) {
          const msgTime = msg.timestamp.toMillis?.() ?? msg.timestamp.toDate().getTime();
          if (protocol === 'EAS' || Date.now() - msgTime > threshold) {
            deleteDoc(doc(collections.messages(chatId), msg.id)).catch(console.error);
          }
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [messages, activeChat, chatId]);

  // Contacts listener — FIX: removed handleFirestoreError rethrow
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collections.contacts(user.qc), (snap) => {
      setChats(snap.docs.map(d => ({ qc: d.id, ...d.data() })));
    }, (error) => {
      console.error('[CONTACTS] Listener error:', error.message);
      if (error.code === 'permission-denied') {
        showToast('Session expired. Please log out and log back in.', 'error');
      }
    });
  }, [user]);

  // Individual unread listeners
  useEffect(() => {
    if (!user || chats.length === 0) return;

    const unsubs = chats.map(chat => {
      const cid = [normalizeQC(user.qc), normalizeQC(chat.qc)].sort().join('__');
      const q = query(
        collections.messages(cid),
        where('to', '==', user.qc),
        where('seenByRecipient', '==', false)
      );

      return onSnapshot(q, (snap) => {
        setUnreads(prev => ({
          ...prev,
          [chat.qc]: snap.docs.length
        }));
      });
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [user, chats]);

  // Sequential Handshake Listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collections.chatRequests,
      where('from', '==', user.qc),
      where('status', '==', 'accepted')
    );

    return onSnapshot(q, async (snap) => {
      for (const d of snap.docs) {
        const req = d.data();
        try {
          const peerSnap = await getDoc(doc(collections.accounts, req.to));
          if (peerSnap.exists()) {
            await setDoc(doc(collections.contacts(user.qc), req.to), {
              qc: req.to,
              publicKeyJwk: peerSnap.data().publicKeyJwk,
              addedAt: serverTimestamp()
            });
            await deleteDoc(d.ref);
            showToast(`Secure connection with ${req.to} confirmed!`, 'success');
          }
        } catch (err) {
          console.error('[HANDSHAKE] Sequential auth failed:', err);
        }
      }
    });
  }, [user]);

  // ── MESSAGE LISTENER ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChat || !user || !chatId) return;

    let unsubFirestore = () => {};
    let unsubTyping = () => {};

    const setupListeners = async () => {
      try {
        const sharedKey = await getOrDeriveSharedKey(user.privateKey, activeChat.qc, chatId);

        unsubFirestore = onSnapshot(
          query(collections.messages(chatId), orderBy('timestamp', 'asc')),
          async (snap) => {
            const isBlocked = account?.blocked?.includes(activeChat.qc);

            const msgs = await Promise.all(snap.docs.map(async (d) => {
              const data = d.data();
              if (isBlocked && data.from !== user.qc) return null;
              try {
                const text = await decryptMessage(data.ciphertext, sharedKey);
                let replyTo = null;
                if (data.replyTo) {
                  try {
                    const replyText = await decryptMessage(data.replyTo.ciphertext, sharedKey);
                    replyTo = { ...data.replyTo, text: replyText };
                  } catch {
                    replyTo = { ...data.replyTo, text: '[ENCRYPTED]' };
                  }
                }
                return { id: d.id, ...data, text, replyTo };
              } catch {
                return { id: d.id, ...data, text: '[DECRYPTION FAILED — KEY MISMATCH]' };
              }
            }));

            setMessages(msgs.filter(m => m !== null));

            if (!isBlocked) {
              snap.docs.forEach(d => {
                const data = d.data();
                if (data.from !== user.qc && !data.seenByRecipient) {
                  updateDoc(d.ref, { seenByRecipient: true }).catch(console.error);
                }
              });
            }
          },
          // FIX: removed handleFirestoreError rethrow
          (error) => console.error('[MESSAGES] Listener error:', error.message)
        );

        unsubTyping = onValue(rtdbRefs.typing(chatId, activeChat.qc), (snap) => {
          setRecipientTyping(!!snap.val());
        });

      } catch (err) {
        console.error('Failed to derive shared key:', err);
        setKeyError(err.message);
      }
    };

    setupListeners();
    return () => { unsubFirestore(); unsubTyping(); };
  }, [activeChat, user, chatId, account]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        const isTrigger = event.target.closest('button')?.contains(event.target) &&
          (event.target.closest('button')?.querySelector('svg') ||
            event.target.closest('button')?.innerHTML.includes('MoreVertical'));

        if (!isTrigger) setShowMoreMenu(false);
      }
    }
    if (showMoreMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (emojiRef.current && !emojiRef.current.contains(event.target)) {
        const isTrigger = event.target.closest('button')?.contains(event.target) &&
          (event.target.closest('button')?.querySelector('svg[data-lucide="smile"]') ||
            event.target.closest('button')?.querySelector('.lucide-smile'));

        if (!isTrigger) setShowEmojiPicker(false);
      }
    }
    if (showEmojiPicker) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  // ── SEND MESSAGE ──────────────────────────────────────────────────────────
  const handleSendMessage = async (e, directText) => {
    if (e) e.preventDefault();
    const text = directText || inputText;
    if (!text.trim() || !activeChat || !chatId) return;
    if (!directText) setInputText('');
    inputRef.current?.focus();

    try {
      const sharedKey = await getOrDeriveSharedKey(user.privateKey, activeChat.qc, chatId);
      const encrypted = await encryptMessage(text, sharedKey);

      let replyToData = null;
      if (replyingTo) {
        const encryptedQuote = await encryptMessage(replyingTo.text, sharedKey);
        replyToData = { ciphertext: encryptedQuote, from: replyingTo.from, id: replyingTo.id };
        setReplyingTo(null);
      }

      await addDoc(collections.messages(chatId), {
        from: user.qc,
        to: activeChat.qc,
        ciphertext: encrypted,
        timestamp: serverTimestamp(),
        seenBySender: true,
        seenByRecipient: false,
        vanishMode: false,
        replyTo: replyToData
      });
    } catch (err) {
      showToast('Failed to encrypt message. ' + err.message, 'error');
    }
  };

  const handleDeleteChat = () => {
    if (!activeChat || !user || !chatId) return;
    setConfirmConfig({
      title: 'PERMANENT DELETION',
      message: 'Are you sure you want to permanently delete this secure channel? This will erase all messages for BOTH users.',
      onConfirm: async () => {
        const cid = [normalizeQC(user.qc), normalizeQC(activeChat.qc)].sort().join('__');
        setConfirmConfig(null);
        setIsConfirmProcessing(false);
        setActiveChat(null);
        const snapshot = await getDocs(query(collections.messages(cid)));
        if (!snapshot.empty) {
          const batch = writeBatch(db);
          snapshot.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        await Promise.all([
          remove(rtdbRefs.vanish(cid)),
          remove(rtdbRefs.vanishState(cid)),
          remove(rtdbRefs.typing(cid, user.qc)),
          remove(rtdbRefs.typing(cid, activeChat.qc))
        ]);
        showToast('Communication channel erased.', 'info');
      }
    });
  };

  const handleTyping = (e) => {
    setInputText(e.target.value);
    if (!typing && activeChat && chatId) {
      setTyping(true);
      set(rtdbRefs.typing(chatId, user.qc), true);
      onDisconnect(rtdbRefs.typing(chatId, user.qc)).remove();
      setTimeout(() => { setTyping(false); remove(rtdbRefs.typing(chatId, user.qc)); }, 3000);
    }
  };

  const handleBlockToggle = async () => {
    if (!activeChat || !user || !account) return;
    const isBlocked = account.blocked?.includes(activeChat.qc);
    const newBlocked = isBlocked
      ? account.blocked.filter(id => id !== activeChat.qc)
      : [...(account.blocked || []), activeChat.qc];
    try {
      await updateDoc(doc(collections.accounts, user.qc), { blocked: newBlocked });
      setShowMoreMenu(false);
    } catch (err) { console.error('Failed to toggle block:', err); }
  };

  const handleRemoveConnection = () => {
    if (!activeChat || !user || !chatId) return;
    setConfirmConfig({
      title: 'NETWORK SCORCH PROTOCOL',
      message: 'WARNING: This will permanently remove this connection and erase ALL shared messages for both parties. Proceed?',
      onConfirm: async () => {
        const cid = [normalizeQC(user.qc), normalizeQC(activeChat.qc)].sort().join('__');
        setConfirmConfig(null);
        setIsConfirmProcessing(false);
        setShowMoreMenu(false);
        setActiveChat(null);
        const msgsSnap = await getDocs(query(collections.messages(cid)));
        if (!msgsSnap.empty) {
          const batch = writeBatch(db);
          msgsSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        await Promise.all([
          deleteDoc(doc(collections.contacts(user.qc), activeChat.qc)),
          deleteDoc(doc(collections.contacts(activeChat.qc), user.qc)),
          remove(rtdbRefs.vanish(cid)),
          remove(rtdbRefs.vanishState(cid)),
          remove(rtdbRefs.typing(cid, user.qc)),
          remove(rtdbRefs.typing(cid, activeChat.qc))
        ]);
        showToast('Connection terminated and scorched.', 'info');
      }
    });
  };

  const handleUpdateNickname = async (e) => {
    e.preventDefault();
    if (!activeChat || !user) return;
    try {
      await updateDoc(doc(collections.contacts(user.qc), activeChat.qc), { nickname: nicknameInput.trim() || null });
      setShowNicknameModal(false);
      setNicknameInput('');
    } catch (err) { console.error('Failed to update nickname:', err); }
  };

  const handleUpdateChatProtocol = async (val) => {
    if (!activeChat || !user) return;
    try {
      await updateDoc(doc(collections.contacts(user.qc), activeChat.qc), { autoDelete: val });
    } catch (err) { console.error('Failed to update chat protocol:', err); }
  };

  // FIX: removed handleFirestoreError rethrow — now gives specific toast for permission-denied
  const handleAddContact = async (e) => {
    e.preventDefault();
    setAddError('');
    const targetQC = newContactQC.trim().toUpperCase();
    if (!targetQC || targetQC === user.qc) { setAddError('Invalid QC Number'); return; }

    try {
      const accountSnap = await getDoc(doc(collections.accounts, targetQC));
      if (!accountSnap.exists()) { setAddError('Identity not found on network'); return; }

      if (!accountSnap.data().publicKeyJwk) {
        setAddError('This identity uses an incompatible version. Ask them to re-create their identity.');
        return;
      }

      const contactSnap = await getDoc(doc(collections.contacts(user.qc), targetQC));
      if (contactSnap.exists()) { setAddError('Identity already in secure channels'); return; }

      const q = query(collections.chatRequests, where('from', '==', user.qc), where('to', '==', targetQC), where('status', '==', 'pending'));
      const existingReqs = await getDocs(q);
      if (!existingReqs.empty) { setAddError('Authorization request already pending'); return; }

      const targetUid = accountSnap.data().uid;
      const myUid = user.uid || (await getDoc(doc(collections.accounts, user.qc))).data().uid;

      await addDoc(collections.chatRequests, {
        from: user.qc,
        to: targetQC,
        fromUid: myUid,
        toUid: targetUid,
        status: 'pending',
        timestamp: serverTimestamp()
      });
      setNewContactQC('');
      setIsAddingContact(false);
      showToast('Authorization request broadcasted.', 'info');
    } catch (err) {
      console.error('[CONTACT] Failed to send auth request:', err);
      if (err.code === 'permission-denied') {
        showToast('Auth session expired. Please log out and log back in.', 'error');
      } else {
        showToast('Failed to send authorization request.', 'error');
      }
    }
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* Contact list sidebar */}
      <div className={`w-full md:w-80 border-r border-border bg-bg2 flex flex-col overflow-hidden ${activeChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-display text-cyan uppercase tracking-widest">Secure Channels</h2>
            <button onClick={() => setIsAddingContact(true)} className="p-1.5 border border-cyan/30 text-cyan hover:bg-cyan/10 rounded transition-all">
              <UserPlus size={14} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input type="text" placeholder="FILTER CONTACTS..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 text-xs" />
          </div>
        </div>

        {isAddingContact && (
          <div className="p-4 border-b border-border bg-bg3">
            <form onSubmit={handleAddContact} className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-cyan uppercase">Add New Identity</span>
                <button type="button" onClick={() => setIsAddingContact(false)} className="text-muted hover:text-text"><ArrowLeft size={12} /></button>
              </div>
              <input type="text" placeholder="QC-XXXXXXXXXX" value={newContactQC} onChange={(e) => setNewContactQC(e.target.value.toUpperCase())} className="w-full text-xs font-mono" autoFocus />
              {addError && <p className="text-[9px] text-red font-mono uppercase">{addError}</p>}
              <button type="submit" className="w-full py-2 bg-cyan text-bg font-display text-[10px] uppercase hover:bg-cyan/80">Establish Connection</button>
            </form>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {chats.length === 0
            ? <div className="p-8 text-center text-muted text-[10px] font-mono uppercase">No secure channels established.</div>
            : chats.filter(c => {
                const q = searchQuery.toUpperCase();
                return c.qc.toUpperCase().includes(q) || (c.nickname?.toUpperCase().includes(q));
              }).map((chat) => (
                <button key={chat.qc} onClick={() => onChatSelect(chat)}
                  className={`w-full p-3 flex items-center gap-3 border-b border-border/10 hover:bg-bg3 transition-all relative group ${activeChat?.qc === chat.qc ? 'bg-bg3 border-l-2 border-l-cyan' : ''}`}
                >
                  <div className={`w-9 h-9 shrink-0 rounded-full border flex items-center justify-center bg-bg relative transition-all duration-200 ${activeChat?.qc === chat.qc ? 'border-cyan shadow-glow-cyan' : 'border-border/40'}`}>
                    <Shield size={18} className={`transition-colors ${activeChat?.qc === chat.qc ? 'text-cyan' : 'text-muted'}`} />
                  </div>
                  <div className="flex-1 text-left overflow-hidden">
                    <div className="flex justify-between items-center mb-0.5 gap-2">
                       <span className={`text-sm md:text-base font-display tracking-tight truncate ${activeChat?.qc === chat.qc ? 'text-cyan' : 'text-text'}`}>
                        {chat.nickname || chat.qc}
                      </span>
                      {unreads[chat.qc] ? (
                        <span className="bg-cyan text-bg text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-glow-cyan animate-pulse">
                          {unreads[chat.qc]}
                        </span>
                      ) : (
                        <span className="text-[7px] font-mono text-green border border-green/30 px-1 py-0.5 rounded-full font-bold">SECURE</span>
                      )}
                    </div>
                  </div>
                </button>
              ))
          }
        </div>
      </div>

      {/* Chat area */}
      <div className={`flex-1 flex flex-col bg-bg relative overflow-hidden ${!activeChat ? 'hidden md:flex' : 'flex'}`}>
        {activeChat ? (
          <>
            <header className="h-14 md:h-16 border-b border-border bg-bg2 flex items-center justify-between px-4 md:px-6">
              <div className="flex items-center gap-3 md:gap-4">
                <button onClick={() => window.history.back()} className="md:hidden text-muted p-1 hover:text-cyan"><ArrowLeft size={20} /></button>
                <div className="flex flex-col">
                  <span className="text-sm md:text-lg font-display text-cyan tracking-wider">{activeChat.nickname || activeChat.qc}</span>
                  <span className="text-[8px] font-mono text-green uppercase tracking-widest">
                    {keyError ? '⚠ KEY ERROR' : recipientTyping ? 'Typing...' : 'ECDH E2E Encrypted'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-4">
                <button onClick={handleDeleteChat} className="p-1.5 md:p-2 border border-border rounded text-muted hover:text-red transition-all">
                  <Trash2 size={14} />
                </button>
                <div className="relative">
                  <button onClick={() => setShowMoreMenu(!showMoreMenu)} className={`p-1.5 md:p-2 border rounded transition-all ${showMoreMenu ? 'border-cyan text-cyan' : 'border-border text-muted'}`}>
                    <MoreVertical size={14} />
                  </button>
                  {showMoreMenu && (
                    <div ref={menuRef} className="absolute right-0 mt-2 w-40 bg-bg2 border border-border shadow-2xl rounded-lg z-50 overflow-hidden">
                      <button onClick={() => { setShowNicknameModal(true); setNicknameInput(activeChat.nickname || ''); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left text-[10px] font-mono hover:bg-bg3 border-b border-border/30 flex items-center gap-2">
                        <Edit3 size={12} /> SET NICKNAME
                      </button>
                      <button onClick={() => { setShowPrivacyModal(true); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left text-[10px] font-mono hover:bg-bg3 border-b border-border/30 flex items-center gap-2">
                        <Shield size={12} /> PRIVACY
                      </button>
                      <button onClick={handleBlockToggle} className="w-full px-4 py-2.5 text-left text-[10px] font-mono hover:bg-bg3 text-red flex items-center gap-2 border-b border-border/30">
                        <ShieldOff size={12} /> {account?.blocked?.includes(activeChat.qc) ? 'UNBLOCK' : 'BLOCK'}
                      </button>
                      <button onClick={handleRemoveConnection} className="w-full px-4 py-2.5 text-left text-[10px] font-mono hover:bg-red/10 text-red flex items-center gap-2">
                        <Trash2 size={12} /> TERMINATE
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {keyError && (
              <div className="px-4 py-2 bg-red/10 border-b border-red/30 text-[10px] font-mono text-red uppercase leading-relaxed">
                ⚠ Security Protocol Failure: {keyError}
                <div className="mt-1 opacity-60 text-[8px]">TIP: If this persists, the peer might have reset their identity. Try re-establishing the connection.</div>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-4 md:px-3 md:py-6 space-y-2 custom-scrollbar">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} user={user} onReply={(m) => { setReplyingTo(m); inputRef.current?.focus(); }} />
              ))}
            </div>

            <div className="border-t border-border bg-bg2 relative">
              <AnimatePresence>
                {replyingTo && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="px-4 py-1.5 bg-bg3 border-l-4 border-cyan flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-display text-cyan uppercase tracking-tighter block">
                          Replying to {replyingTo.from === user.qc ? 'Yourself' : (activeChat.nickname || activeChat.qc)}
                        </span>
                        <p className="text-[11px] font-mono text-muted truncate italic">{replyingTo.text}</p>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-white/5 rounded text-muted hover:text-red"><X size={16} /></button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="p-3 md:p-4">
                {showEmojiPicker && (
                  <div ref={emojiRef} className="absolute bottom-full left-4 mb-2">
                    <EmojiPicker onSelect={(emoji) => setInputText(prev => prev + emoji)} onClose={() => setShowEmojiPicker(false)} />
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center gap-2 md:gap-3">
                  <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-2 rounded border transition-all ${showEmojiPicker ? 'border-cyan text-cyan' : 'text-muted'}`}>
                    <Smile size={20} />
                  </button>
                  <input ref={inputRef} type="text" value={inputText} onChange={handleTyping} placeholder={keyError ? 'Key error — cannot send' : 'ENCRYPTED SIGNAL...'} disabled={!!keyError}
                    className="flex-1 bg-bg border border-border px-4 py-2 text-sm md:text-base font-mono focus:border-cyan outline-none rounded-full disabled:opacity-40" />
                  <button type="submit" disabled={!inputText.trim() || !!keyError}
                    className="px-6 py-2 bg-cyan text-bg font-display text-[10px] uppercase hover:bg-cyan/80 transition-all shadow-glow-cyan disabled:opacity-40">
                    Transmit
                  </button>
                </form>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-30">
            <Shield size={64} className="mb-4" />
            <h2 className="text-lg font-display uppercase">ECDH Quantum Encryption</h2>
          </div>
        )}

        {showPrivacyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-bg2 border border-border p-6 rounded-lg animate-in zoom-in-95">
              <div className="flex flex-col items-center gap-4 text-center">
                <h3 className="text-xs font-display text-cyan uppercase tracking-widest">Protocol Strategy</h3>
                <div className="grid grid-cols-2 gap-2 w-full">
                  {['EAS', '1MIN', '10MIN', '30MIN', '1HR'].map((val) => (
                    <button key={val} onClick={() => handleUpdateChatProtocol(val)} className={`py-2 text-[8px] font-mono border ${activeChat.autoDelete === val || (!activeChat.autoDelete && val === 'EAS') ? 'border-cyan text-cyan' : 'border-border text-muted'}`}>
                      {val}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowPrivacyModal(false)} className="w-full mt-2 py-2 border border-border text-muted text-[10px] font-mono">DISMISS</button>
              </div>
            </div>
          </div>
        )}

        {showNicknameModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-bg2 border border-border p-6 rounded-lg animate-in zoom-in-95">
              <form onSubmit={handleUpdateNickname} className="space-y-4">
                <h3 className="text-xs font-display text-cyan uppercase">Set Nickname</h3>
                <input type="text" value={nicknameInput} onChange={(e) => setNicknameInput(e.target.value)} className="w-full bg-bg border border-border px-3 py-2 text-xs font-mono focus:border-cyan outline-none" autoFocus />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowNicknameModal(false)} className="flex-1 py-2 border border-border text-muted text-[10px] font-mono">CANCEL</button>
                  <button type="submit" className="flex-1 py-2 bg-cyan text-bg font-display text-[10px] uppercase">SAVE</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {confirmConfig && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-md">
          <div className="w-full max-w-sm bg-bg2 border-2 border-red/30 p-8 rounded-lg animate-in zoom-in-95">
            <div className="flex flex-col items-center gap-6 text-center">
              <ShieldAlert size={32} className="text-red animate-pulse" />
              <h3 className="text-lg font-display text-red uppercase">{confirmConfig.title}</h3>
              <p className="text-[10px] font-mono text-text/70 uppercase tracking-widest">{confirmConfig.message}</p>
              <div className="flex gap-4 w-full">
                <button onClick={() => setConfirmConfig(null)} className="flex-1 py-3 border border-border text-muted text-[10px] uppercase">Abort</button>
                <button onClick={handleConfirmAction} className="flex-1 py-3 bg-red/10 border border-red/50 text-red text-[10px] uppercase">Confirm</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
