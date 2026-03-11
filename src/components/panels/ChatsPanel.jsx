import React, { useState, useEffect, useRef } from 'react';
import {
  collections,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  getDocs,
  limit,
  handleFirestoreError,
  OperationType,
  deleteDoc
} from '../../firebase/firestore';
import { rtdbRefs, set, onValue, onDisconnect, remove, ref, rtdb } from '../../firebase/realtimedb';
import { encryptMessage, decryptMessage } from '../../utils/encryption';
import {
  Search,
  Send,
  Ghost,
  Clock,
  Check,
  CheckCheck,
  Smile,
  UserPlus,
  ArrowLeft,
  ShieldAlert,
  Shield,
  Trash2,
  MoreVertical,
  User as UserIcon,
  ShieldOff,
  Edit3
} from 'lucide-react';
import EmojiPicker from '../shared/EmojiPicker';
import QuantKeyboard from '../shared/QuantKeyboard';

function ChatListItem({ chat, user, active, isBlocked, onClick }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user || !chat || isBlocked) {
      setUnreadCount(0);
      return;
    }
    const normalize = (id) => {
      if (!id) return '';
      const match = id.match(/\d+/);
      return match ? match[0] : id.trim().toUpperCase();
    };

    const id1 = normalize(user.qc);
    const id2 = normalize(chat.qc);
    const chatId = [id1, id2].sort().join('__');

    const q = query(
      collections.messages(chatId),
      where('from', '==', chat.qc),
      where('seenByRecipient', '==', false)
    );

    const unsub = onSnapshot(q, (snap) => {
      setUnreadCount(snap.docs.length);
    });

    return unsub;
  }, [user, chat]);

  return (
    <button
      onClick={onClick}
      className={`w-full p-3 flex items-center gap-3 border-b border-border/10 hover:bg-bg3 transition-all relative group ${active ? 'bg-bg3 border-l-2 border-l-cyan' : ''
        }`}
    >
      <div className={`w-9 h-9 shrink-0 rounded-full border flex items-center justify-center bg-bg relative transition-all duration-200 ${active ? 'border-cyan shadow-glow-cyan' : 'border-border/40'}`}>
        <Shield size={18} className={`transition-colors ${active ? 'text-cyan' : 'text-muted'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyan text-bg text-[10px] font-mono font-bold rounded-full flex items-center justify-center shadow-lg animate-pulse">
            {unreadCount}
          </span>
        )}
      </div>
      <div className="flex-1 text-left overflow-hidden">
        <div className="flex justify-between items-center mb-0.5 gap-2">
          <span className={`text-[11px] font-display tracking-tight truncate ${active ? 'text-cyan' : 'text-text'}`}>
            {chat.nickname || chat.qc}
          </span>
          {isBlocked ? (
            <span className="text-[7px] font-mono text-red font-bold shrink-0">BLOCK</span>
          ) : (
            <span className="text-[7px] font-mono text-green border border-green/30 px-1 py-0.5 rounded-full font-bold shrink-0">SECURE</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && !isBlocked && <div className="w-1 h-1 rounded-full bg-cyan shadow-glow-cyan" />}
          <p className={`text-[9px] font-mono truncate uppercase tracking-tighter ${unreadCount > 0 && !isBlocked ? 'text-cyan font-bold' : 'text-muted/50'}`}>
            {isBlocked ? 'Offline' : (unreadCount > 0 ? `${unreadCount} Signals` : 'Active')}
          </p>
        </div>
      </div>
      {!isBlocked && unreadCount > 0 && (
        <div className="bg-cyan/10 text-cyan text-[8px] font-mono font-bold w-4 h-4 rounded-sm border border-cyan/30 flex items-center justify-center shrink-0">
          {unreadCount}
        </div>
      )}
    </button>
  );
}

export default function ChatsPanel({ user }) {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [typing, setTyping] = useState(false);
  const [recipientTyping, setRecipientTyping] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContactQC, setNewContactQC] = useState('');
  const [addError, setAddError] = useState('');
  const [account, setAccount] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [showQuantKeyboard, setShowQuantKeyboard] = useState(false);

  const scrollRef = useRef();

  // Robust normalization to handle prefix mismatches (e.g., QC- vs UL-)
  const normalizeQC = (id) => {
    if (!id) return '';
    const match = id.match(/\d+/);
    return match ? match[0] : id.trim().toUpperCase();
  };

  // Centralize chatId generation to ensure consistency
  const chatId = React.useMemo(() => {
    if (!user?.qc || !activeChat?.qc) return null;
    const id1 = normalizeQC(user.qc);
    const id2 = normalizeQC(activeChat.qc);
    const cid = [id1, id2].sort().join('__');
    return cid;
  }, [user, activeChat]);

  // Reset states when switching chats
  useEffect(() => {
    setRecipientTyping(false);
  }, [activeChat]);

  // Load account for auto-delete preference
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(collections.accounts, user.qc), (snap) => {
      if (snap.exists()) {
        setAccount(snap.data());
      }
    });

    // Ensure activeChat has its latest data (like protocol)
    let unsubContact = () => { };
    if (activeChat) {
      unsubContact = onSnapshot(doc(collections.contacts(user.qc), activeChat.qc), (snap) => {
        if (snap.exists()) {
          setActiveChat(prev => prev ? { ...prev, ...snap.data() } : null);
        }
      });
    }

    return () => {
      unsub();
      unsubContact();
    };
  }, [user, activeChat?.qc]);

  // Auto-delete logic
  useEffect(() => {
    if (!activeChat || !user || !chatId || messages.length === 0) return;

    const interval = setInterval(() => {
      const protocol = activeChat.autoDelete || 'EAS';
      const now = Date.now();
      let threshold = 0;
      switch (protocol) {
        case 'EAS': threshold = 0; break;
        case '1MIN': threshold = 60 * 1000; break;
        case '10MIN': threshold = 10 * 60 * 1000; break;
        case '30MIN': threshold = 30 * 60 * 1000; break;
        case '1HR': threshold = 60 * 60 * 1000; break;
        default: return;
      }

      messages.forEach(msg => {
        if (msg.seenByRecipient && msg.timestamp) {
          const msgTime = msg.timestamp.toMillis ? msg.timestamp.toMillis() : msg.timestamp.toDate().getTime();

          if (protocol === 'EAS') {
            deleteDoc(doc(collections.messages(chatId), msg.id)).catch(e => console.error('Failed to EAS delete', e));
          } else {
            const nowTime = Date.now();
            if (nowTime - msgTime > threshold) {
              deleteDoc(doc(collections.messages(chatId), msg.id)).catch(e => console.error('Failed to auto-delete', e));
            }
          }
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [messages, activeChat, user, chatId]);

  // Load chat list (Contacts only)
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collections.contacts(user.qc), (snap) => {
      const contactList = snap.docs.map(d => ({ qc: d.id, ...d.data() }));
      setChats(contactList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `accounts/${user.qc}/contacts`);
    });
    return unsub;
  }, [user]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChat || !user || !chatId) return;

    const chatSeed = `CHAT_SEED_${chatId}`;

    // Firestore messages
    const unsubFirestore = onSnapshot(
      query(collections.messages(chatId), orderBy('timestamp', 'asc')),
      async (snap) => {
        const isBlocked = account?.blocked?.includes(activeChat.qc);

        const msgs = await Promise.all(snap.docs
          .map(async (d) => {
            const data = d.data();
            // Filter out messages from blocked users
            if (isBlocked && data.from !== user.qc) return null;

            try {
              const text = await decryptMessage(data.ciphertext, chatSeed);
              return { id: d.id, ...data, text };
            } catch (e) {
              return { id: d.id, ...data, text: '[ENCRYPTED]' };
            }
          }));

        setMessages(msgs.filter(m => m !== null));

        // Mark as seen (Only if NOT blocked)
        if (!isBlocked) {
          snap.docs.forEach(d => {
            const data = d.data();
            if (data.from !== user.qc && !data.seenByRecipient) {
              updateDoc(d.ref, { seenByRecipient: true }).catch(e => handleFirestoreError(e, OperationType.UPDATE, d.ref.path));
            }
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `messages/${chatId}/msgs`);
      }
    );

    // Typing indicator
    const unsubTyping = onValue(rtdbRefs.typing(chatId, activeChat.qc), (snap) => {
      setRecipientTyping(!!snap.val());
    });

    return () => {
      unsubFirestore();
      unsubTyping();
    };
  }, [activeChat, user, chatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-scroll when keyboard opens/closes for WhatsApp feel
  useEffect(() => {
    if (showQuantKeyboard && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 300); // Wait for transition
    }
  }, [showQuantKeyboard]);

  const handleSendMessage = async (e, directText) => {
    if (e) e.preventDefault();
    const text = directText || inputText;
    if (!text.trim() || !activeChat || !chatId) return;

    if (!directText) setInputText('');

    const chatSeed = `CHAT_SEED_${chatId}`;
    const encrypted = await encryptMessage(text, chatSeed);
    await addDoc(collections.messages(chatId), {
      from: user.qc,
      to: activeChat.qc,
      ciphertext: encrypted,
      timestamp: serverTimestamp(),
      seenBySender: true,
      seenByRecipient: false,
      vanishMode: false
    }).catch(e => handleFirestoreError(e, OperationType.CREATE, `messages/${chatId}/msgs`));
  };

  const handleDeleteChat = async () => {
    if (!activeChat || !user || !chatId) return;

    if (window.confirm('Are you sure you want to permanently delete this secure channel? This will erase all messages for BOTH users.')) {
      try {

        // Delete Firestore messages sequentially to ensure reliable deletion
        for (const msg of messages) {
          await deleteDoc(doc(collections.messages(chatId), msg.id));
        }

        // Remove RTDB refs for state and typing indicator
        await remove(rtdbRefs.vanish(chatId));
        await remove(rtdbRefs.vanishState(chatId));
        await remove(rtdbRefs.typing(chatId, user.qc));
        await remove(rtdbRefs.typing(chatId, activeChat.qc));

        setActiveChat(null);
      } catch (err) {
        console.error('Failed to delete chat:', err);
        alert('Failed to delete chat. Please try again.');
      }
    }
  };

  const handleTyping = (e) => {
    setInputText(e.target.value);
    if (!typing && activeChat && chatId) {
      setTyping(true);
      set(rtdbRefs.typing(chatId, user.qc), true);
      onDisconnect(rtdbRefs.typing(chatId, user.qc)).remove();

      setTimeout(() => {
        setTyping(false);
        remove(rtdbRefs.typing(chatId, user.qc));
      }, 3000);
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
    } catch (err) {
      console.error('Failed to toggle block:', err);
    }
  };

  const handleRemoveConnection = async () => {
    if (!activeChat || !user || !chatId) return;

    if (window.confirm('WARNING: This will permanently remove this connection and erase ALL shared messages for both parties. This action cannot be undone. Proceed?')) {
      try {
        // 1. Delete all messages
        const msgsSnap = await getDocs(collections.messages(chatId));
        const deletePromises = msgsSnap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        // 2. Remove from both users' contact lists
        await deleteDoc(doc(collections.contacts(user.qc), activeChat.qc));
        await deleteDoc(doc(collections.contacts(activeChat.qc), user.qc));

        // 3. Clean up RTDB refs
        await remove(rtdbRefs.vanish(chatId));
        await remove(rtdbRefs.vanishState(chatId));
        await remove(rtdbRefs.typing(chatId, user.qc));
        await remove(rtdbRefs.typing(chatId, activeChat.qc));

        setShowMoreMenu(false);
        setActiveChat(null);
        alert('Connection terminated and scorched from network.');
      } catch (err) {
        console.error('Failed to remove connection:', err);
        alert('Partial failure during network purge. Please try again.');
        handleFirestoreError(err, OperationType.DELETE, `connection/${chatId}`);
      }
    }
  };

  const handleUpdateNickname = async (e) => {
    e.preventDefault();
    if (!activeChat || !user) return;
    try {
      await updateDoc(doc(collections.contacts(user.qc), activeChat.qc), {
        nickname: nicknameInput.trim() || null
      });
      setShowNicknameModal(false);
      setNicknameInput('');
    } catch (err) {
      console.error('Failed to update nickname:', err);
    }
  };

  const handleUpdateChatProtocol = async (val) => {
    if (!activeChat || !user) return;
    try {
      await updateDoc(doc(collections.contacts(user.qc), activeChat.qc), {
        autoDelete: val
      });
    } catch (err) {
      console.error('Failed to update chat protocol:', err);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    setAddError('');
    const targetQC = newContactQC.trim().toUpperCase();

    if (!targetQC || targetQC === user.qc) {
      setAddError('Invalid QC Number');
      return;
    }

    try {
      // Check if account exists
      const accountSnap = await getDoc(doc(collections.accounts, targetQC));
      if (!accountSnap.exists()) {
        setAddError('Identity not found on network');
        return;
      }

      // Check if already in contacts
      const contactSnap = await getDoc(doc(collections.contacts(user.qc), targetQC));
      if (contactSnap.exists()) {
        setAddError('Identity already in secure channels');
        return;
      }

      // Check if a request is already pending
      const q = query(
        collections.chatRequests,
        where('from', '==', user.qc),
        where('to', '==', targetQC),
        where('status', '==', 'pending')
      );
      const existingReqs = await getDocs(q);
      if (!existingReqs.empty) {
        setAddError('Authorization request already pending');
        return;
      }

      // Create chat request
      await addDoc(collections.chatRequests, {
        from: user.qc,
        to: targetQC,
        status: 'pending',
        timestamp: serverTimestamp()
      });

      setNewContactQC('');
      setIsAddingContact(false);
      alert('Authorization request broadcasted. Waiting for peer response.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `chat_requests`);
    }
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* Chat List */}
      <div className={`w-full md:w-80 border-r border-border bg-bg2 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-display text-cyan uppercase tracking-widest">Secure Channels</h2>
            <button
              onClick={() => setIsAddingContact(true)}
              className="p-1.5 border border-cyan/30 text-cyan hover:bg-cyan/10 rounded transition-all"
              title="Add Contact"
            >
              <UserPlus size={14} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              type="text"
              placeholder="FILTER CONTACTS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 text-xs"
            />
          </div>
        </div>

        {/* Add Contact Modal/Overlay */}
        {isAddingContact && (
          <div className="p-4 border-b border-border bg-bg3 animate-in fade-in slide-in-from-top-2">
            <form onSubmit={handleAddContact} className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-cyan uppercase">Add New Identity</span>
                <button type="button" onClick={() => setIsAddingContact(false)} className="text-muted hover:text-text">
                  <ArrowLeft size={12} />
                </button>
              </div>
              <input
                type="text"
                placeholder="QC-XXXXXXXXXX"
                value={newContactQC}
                onChange={(e) => setNewContactQC(e.target.value.toUpperCase())}
                className="w-full text-xs font-mono"
                autoFocus
              />
              {addError && <p className="text-[9px] text-red font-mono uppercase">{addError}</p>}
              <button
                type="submit"
                className="w-full py-2 bg-cyan text-bg font-display text-[10px] uppercase hover:bg-cyan/80"
              >
                Establish Connection
              </button>
            </form>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {chats.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-[10px] font-mono text-muted uppercase leading-relaxed">
                No secure channels established.<br />Add a contact to begin.
              </p>
            </div>
          ) : (
            chats.filter(c => c.qc.includes(searchQuery.toUpperCase())).map((chat) => (
              <ChatListItem
                key={chat.qc}
                chat={chat}
                user={user}
                active={activeChat?.qc === chat.qc}
                isBlocked={account?.blocked?.includes(chat.qc)}
                onClick={() => setActiveChat(chat)}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-bg relative ${!activeChat ? 'hidden md:flex' : 'flex'}`}>
        {activeChat ? (
          <>
            {/* Chat Header */}
            <header className="h-14 md:h-16 border-b border-border bg-bg2 flex items-center justify-between px-4 md:px-6">
              <div className="flex items-center gap-3 md:gap-4">
                <button onClick={() => setActiveChat(null)} className="md:hidden text-muted p-1 hover:text-cyan">
                  <ArrowLeft size={20} />
                </button>
                <div className="flex flex-col">
                  <span className="text-xs md:text-sm font-display text-cyan tracking-wider truncate max-w-[150px] sm:max-w-none">
                    {activeChat.nickname || activeChat.qc}
                  </span>
                  <span className="text-[8px] font-mono text-green uppercase tracking-widest">
                    {recipientTyping ? 'Typing...' : 'End-to-End Encrypted'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-4">
                <button
                  onClick={handleDeleteChat}
                  className="p-1.5 md:p-2 border border-border rounded text-muted hover:text-red hover:border-red/50 hover:bg-red/10 transition-all"
                  title="Delete Chat"
                >
                  <Trash2 size={14} className="md:w-4 md:h-4" />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    className={`p-1.5 md:p-2 border rounded transition-all ${showMoreMenu ? 'border-cyan text-cyan bg-cyan/10' : 'border-border text-muted hover:text-cyan'}`}
                  >
                    <MoreVertical size={14} className="md:w-4 md:h-4" />
                  </button>
                  {showMoreMenu && (
                    <div className="absolute right-0 mt-2 w-40 bg-bg2 border border-border shadow-2xl rounded-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                      <button
                        onClick={() => { setShowNicknameModal(true); setNicknameInput(activeChat.nickname || ''); setShowMoreMenu(false); }}
                        className="w-full px-4 py-2.5 text-left text-[10px] font-mono hover:bg-bg3 border-b border-border/30 flex items-center gap-2"
                      >
                        <Edit3 size={12} /> SET NICKNAME
                      </button>
                      <button
                        onClick={() => { setShowPrivacyModal(true); setShowMoreMenu(false); }}
                        className="w-full px-4 py-2.5 text-left text-[10px] font-mono hover:bg-bg3 border-b border-border/30 flex items-center gap-2"
                      >
                        <Shield size={12} /> PRIVACY
                      </button>
                      <button
                        onClick={handleBlockToggle}
                        className="w-full px-4 py-2.5 text-left text-[10px] font-mono hover:bg-bg3 text-red flex items-center gap-2 border-b border-border/30"
                      >
                        {account?.blocked?.includes(activeChat.qc) ? <Shield size={12} /> : <ShieldOff size={12} />}
                        {account?.blocked?.includes(activeChat.qc) ? 'UNBLOCK USER' : 'BLOCK USER'}
                      </button>
                      <button
                        onClick={handleRemoveConnection}
                        className="w-full px-4 py-2.5 text-left text-[10px] font-mono hover:bg-red/10 text-red flex items-center gap-2"
                      >
                        <Trash2 size={12} /> REMOVE CONNECTION
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Messages */}
            <div
              ref={scrollRef}
              onClick={() => setShowQuantKeyboard(false)}
              className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar transition-all duration-300 ${showQuantKeyboard ? 'pb-[280px] md:pb-6' : ''}`}
            >
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.from === user.qc ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] sm:max-w-[80%] p-3 rounded-lg border ${msg.from === user.qc
                    ? 'bg-cyan/5 border-cyan/30 rounded-tr-none'
                    : 'bg-bg2 border-border rounded-tl-none'
                    }`}>
                    <p className="text-[11px] md:text-xs font-mono leading-relaxed break-words">{msg.text}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[8px] font-mono text-muted/50">
                        {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.from === user.qc && (
                        msg.seenByRecipient ? <CheckCheck size={10} className="text-cyan" /> : <Check size={10} className="text-muted" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Input Area */}
            <div className="p-3 md:p-4 border-t border-border bg-bg2 relative">
              {showEmojiPicker && (
                <div className="absolute bottom-full left-4 mb-2">
                  <EmojiPicker
                    onSelect={(emoji) => setInputText(prev => prev + emoji)}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                </div>
              )}

              <form onSubmit={handleSendMessage} className="flex items-center gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-2 rounded border transition-all ${showEmojiPicker ? 'border-cyan text-cyan bg-cyan/10' : 'border-border text-muted hover:text-cyan'
                    }`}
                >
                  <Smile size={20} />
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={handleTyping}
                  disabled={account?.blocked?.includes(activeChat.qc)}
                  placeholder={account?.blocked?.includes(activeChat.qc) ? "USER BLOCKED - TRANSMISSION DISABLED" : "ENCRYPTED SIGNAL..."}
                  className="flex-1 bg-bg border border-border px-3 md:px-4 py-2 text-xs md:text-sm font-mono focus:border-cyan outline-none transition-all disabled:opacity-30 hidden md:block"
                />
                <div
                  onClick={() => !account?.blocked?.includes(activeChat.qc) && setShowQuantKeyboard(true)}
                  className={`flex-1 bg-bg border border-border px-4 py-2 text-xs font-mono transition-all md:hidden cursor-text rounded-2xl ${account?.blocked?.includes(activeChat.qc) ? 'opacity-30' : 'opacity-100'}`}
                >
                  {inputText || (account?.blocked?.includes(activeChat.qc) ? "USER BLOCKED" : "Secure message...")}
                </div>
                <button
                  type="submit"
                  disabled={!inputText.trim() || account?.blocked?.includes(activeChat.qc)}
                  className="px-4 md:px-6 py-2 bg-cyan text-bg font-display text-[10px] md:text-xs uppercase hover:bg-cyan/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-cyan"
                >
                  <Send size={16} className="md:hidden" />
                  <span className="hidden md:inline">Transmit</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-30">
            <Shield size={64} className="text-border mb-4" />
            <h2 className="text-lg md:text-xl font-display mb-2 uppercase">Quantum Encryption Active</h2>
            <p className="text-[10px] md:text-xs font-mono text-muted max-w-xs uppercase tracking-widest leading-relaxed">
              Select a secure channel to begin end-to-end encrypted communication
            </p>
          </div>
        )}

        {/* Privacy Control Modal */}
        {showPrivacyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-bg2 border border-border p-6 rounded-lg shadow-2xl relative animate-in zoom-in-95">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full border-2 border-cyan flex items-center justify-center bg-bg relative shadow-glow-cyan">
                  <UserIcon size={32} className="text-cyan" />
                </div>
                <div>
                  <h3 className="text-xs font-display text-cyan uppercase tracking-widest mb-1">Peer Identity</h3>
                  <p className="text-sm font-display text-text">{activeChat.qc}</p>
                </div>
                <div className="w-full space-y-3 mt-2">
                  <p className="text-[10px] font-display text-cyan uppercase tracking-widest text-left">Auto-Delete Protocol</p>
                  <div className="grid grid-cols-2 gap-2">
                    {['EAS', '1MIN', '10MIN', '30MIN', '1HR'].map((val) => (
                      <button
                        key={val}
                        onClick={() => handleUpdateChatProtocol(val)}
                        className={`py-2 text-[8px] font-mono border transition-all ${val === 'EAS' ? 'col-span-2' : ''} ${activeChat.autoDelete === val || (!activeChat.autoDelete && val === 'EAS')
                          ? 'border-cyan text-cyan bg-cyan/10'
                          : 'border-border text-muted hover:border-muted'
                          }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-full grid grid-cols-2 gap-2">
                  <div className="p-2 border border-border rounded bg-bg text-left">
                    <p className="text-[8px] font-mono text-muted uppercase">Status</p>
                    <p className="text-[10px] font-mono text-green uppercase">Authorized</p>
                  </div>
                  <div className="p-2 border border-border rounded bg-bg text-left">
                    <p className="text-[8px] font-mono text-muted uppercase">Protocol</p>
                    <p className="text-[10px] font-mono text-cyan uppercase">{activeChat.autoDelete || 'EAS'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="w-full mt-2 py-2 border border-border text-muted hover:text-text hover:bg-bg3 text-[10px] font-mono transition-all"
                >
                  DISMISS
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Nickname Modal */}
        {showNicknameModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-bg2 border border-border p-6 rounded-lg shadow-2xl relative animate-in zoom-in-95">
              <form onSubmit={handleUpdateNickname} className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <Edit3 size={16} className="text-cyan" />
                  <h3 className="text-xs font-display text-cyan uppercase tracking-widest">Set Local Nickname</h3>
                </div>
                <p className="text-[10px] font-mono text-muted uppercase">This name is only visible to you.</p>
                <input
                  type="text"
                  placeholder="ENTER NICKNAME..."
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  className="w-full bg-bg border border-border px-3 py-2 text-xs font-mono focus:border-cyan outline-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNicknameModal(false)}
                    className="flex-1 py-2 border border-border text-muted hover:text-text text-[10px] font-mono transition-all"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-cyan text-bg font-display text-[10px] uppercase hover:bg-cyan/80 transition-all font-bold"
                  >
                    SAVE NAME
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Quant Keyboard for Mobile */}
        {showQuantKeyboard && (
          <QuantKeyboard
            onSend={(val) => {
              handleSendMessage(null, val);
              setInputText('');
            }}
            onClose={() => setShowQuantKeyboard(false)}
            initialValue={inputText}
          />
        )}
      </div>
    </div>
  );
}
