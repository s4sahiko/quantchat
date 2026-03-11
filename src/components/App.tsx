import React, { useState, useEffect, useRef } from 'react';
import Landing from './Landing.jsx';
import CreateIdentity from './CreateIdentity';
import Login from './Login';
import ProfilePanel from './panels/ProfilePanel';
import ChatsPanel from './panels/ChatsPanel';
import GroupsStatusPanel from './panels/GroupsStatusPanel';
import NotificationsPanel from './panels/NotificationsPanel';
import Watermark from './shared/Watermark';
import ErrorBoundary from './shared/ErrorBoundary';
import { initScreenshotPrevention } from '../utils/screenshotBlock';
import { Shield, User, MessageSquare, Globe, LogOut, Bell, ShieldAlert } from 'lucide-react';
import { collections, onSnapshot, query, where, handleFirestoreError, OperationType, collectionGroup, db } from '../firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [view, setView] = useState('landing'); // landing | create | login | main
  const [user, setUser] = useState(null); // { qc, key, data }
  const [activePanel, setActivePanel] = useState('chats'); // profile | chats | groups
  const [screenshotBlocked, setScreenshotBlocked] = useState(false);
  const [pendingNotifications, setPendingNotifications] = useState(0);
  const [totalUnreads, setTotalUnreads] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const notificationsRef = useRef(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    if (!user) return;
    const q = query(
      collections.chatRequests,
      where('to', '==', user.qc),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, (snap) => {
      setPendingNotifications(snap.docs.length);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chat_requests');
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    try {
      const q = query(
        collectionGroup(db, 'messages'),
        where('to', '==', user.qc),
        where('seenByRecipient', '==', false)
      );

      const unsub = onSnapshot(q, (snap) => {
        setTotalUnreads(snap.docs.length);
      }, (error) => {
        console.warn('Unread message index might be building...', error);
      });
      return unsub;
    } catch (e) {
      console.error('Failed to setup global unread listener:', e);
    }
  }, [user]);

  useEffect(() => {
    const saved = localStorage.getItem('qc_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed);
        setView('main');
      } catch (e) {
        localStorage.removeItem('qc_session');
      }
    }
  }, []);

  useEffect(() => {
    if (user) {
      const cleanup = initScreenshotPrevention(user.qc, () => {
        setScreenshotBlocked(true);
        setTimeout(() => setScreenshotBlocked(false), 30000);
      });
      return cleanup;
    }
  }, [user]);

  // Handle hardware/browser back button
  useEffect(() => {
    if (view !== 'main') return;

    const handlePopState = (event) => {
      const state = event.state;
      if (state) {
        if (state.panel) setActivePanel(state.panel);
        if (state.chat !== undefined) {
          setActiveChat(state.chat);
          setIsChatOpen(!!state.chat);
        }
        setShowNotifications(!!state.notifications);
        setIsAddingContact(!!state.addingContact);
      } else {
        setActivePanel('chats');
        setActiveChat(null);
        setIsChatOpen(false);
        setShowNotifications(false);
        setIsAddingContact(false);
      }
    };

    window.addEventListener('popstate', handlePopState);

    if (!window.history.state) {
      window.history.replaceState({
        panel: 'chats',
        chat: null,
        notifications: false,
        addingContact: false
      }, '');
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [view]);

  // Navigation Wrappers
  const navigateToPanel = (panel) => {
    if (activePanel === panel && (panel !== 'chats' || (!activeChat && !showNotifications && !isAddingContact))) return;

    setActivePanel(panel);
    if (panel === 'chats') {
      window.history.pushState({ panel, chat: activeChat, notifications: false, addingContact: false }, '');
    } else {
      setActiveChat(null);
      setIsChatOpen(false);
      window.history.pushState({ panel, chat: null, notifications: false, addingContact: false }, '');
    }
  };

  const handleChatSelection = (chat) => {
    if (activeChat?.qc === chat?.qc && !showNotifications && !isAddingContact) return;

    setActiveChat(chat);
    setIsChatOpen(!!chat);
    setShowNotifications(false);
    setIsAddingContact(false);
    window.history.pushState({ panel: 'chats', chat, notifications: false, addingContact: false }, '');
  };

  const toggleNotifications = (show) => {
    setShowNotifications(show);
    if (show) {
      window.history.pushState({
        panel: activePanel,
        chat: activeChat,
        notifications: true,
        addingContact: isAddingContact
      }, '');
    } else if (window.history.state?.notifications) {
      window.history.back();
    }
  };

  const toggleAddingContact = (show) => {
    setIsAddingContact(show);
    if (show) {
      window.history.pushState({
        panel: 'chats',
        chat: activeChat,
        notifications: showNotifications,
        addingContact: true
      }, '');
    } else if (window.history.state?.addingContact) {
      window.history.back();
    }
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        const isTrigger = event.target.closest('button')?.contains(event.target) &&
          event.target.closest('button')?.innerHTML.includes('Bell');

        if (!isTrigger && showNotifications) {
          toggleNotifications(false);
        }
      }
    }

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const handleAuthComplete = (userData) => {
    setUser(userData);
    localStorage.setItem('qc_session', JSON.stringify(userData));
    setView('main');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('qc_session');
    setView('landing');
  };

  if (view === 'landing') return <Landing onNavigate={setView} showToast={showToast} />;
  if (view === 'create') return <CreateIdentity onNavigate={setView} onComplete={handleAuthComplete} showToast={showToast} />;
  if (view === 'login') return <Login onNavigate={setView} onComplete={handleAuthComplete} showToast={showToast} />;

  return (
    <ErrorBoundary>
      <div id="qc-app" className="h-[100dvh] flex flex-col bg-bg overflow-hidden relative">
        <Watermark qcNumber={user?.qc} />
        <div className="scanline-overlay" />

        <header className={`h-14 md:h-16 border-b border-border bg-bg2 flex items-center justify-between px-4 md:px-6 z-50 ${isChatOpen ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center gap-2 md:gap-3">
            <Shield className="text-cyan w-5 h-5 md:w-6 md:h-6 glow-text" />
            <h1 className="text-base md:text-lg font-display tracking-wide glow-text">QUANT <span className="text-muted">CHAT</span></h1>
          </div>
          <div className="flex items-center gap-3 md:gap-6">
            <div className="relative">
              <button
                onClick={() => toggleNotifications(!showNotifications)}
                className={`p-1.5 md:p-2 border transition-all relative ${showNotifications ? 'border-cyan bg-cyan/10 text-cyan' : 'border-border text-muted hover:text-cyan'
                  }`}
              >
                <Bell size={16} className="md:w-[18px] md:h-[18px]" />
                {pendingNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-red text-bg text-[10px] md:text-[12px] font-mono font-bold rounded-full flex items-center justify-center shadow-lg animate-pulse">
                    {pendingNotifications}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    ref={notificationsRef}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="fixed left-4 right-4 top-16 sm:absolute sm:inset-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-80 md:w-96 h-[400px] md:h-[500px] bg-bg2 border border-border shadow-2xl z-[100] overflow-hidden rounded-lg origin-top-right"
                  >
                    <NotificationsPanel user={user} onClose={() => toggleNotifications(false)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] font-mono text-muted uppercase">Identity:</span>
              <span className="text-sm md:text-base font-display text-cyan tracking-wider">{user?.qc}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 md:p-2 border border-red/30 text-red/50 hover:text-red hover:border-red transition-all"
            >
              <LogOut size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <nav className={`order-last md:order-first w-full md:w-20 h-16 md:h-full border-t md:border-t-0 md:border-r border-border bg-bg2 flex flex-row md:flex-col items-center justify-around md:justify-start md:py-8 md:gap-8 z-50 ${isChatOpen ? 'hidden md:flex' : 'flex'}`}>
            <NavIcon
              icon={<MessageSquare size={20} className="md:w-6 md:h-6" />}
              active={activePanel === 'chats'}
              onClick={() => navigateToPanel('chats')}
              label="CHATS"
              badge={totalUnreads > 0 ? totalUnreads : null}
            />
            <NavIcon
              icon={<Globe size={20} className="md:w-6 md:h-6" />}
              active={activePanel === 'groups'}
              onClick={() => navigateToPanel('groups')}
              label="GROUPS"
            />
            <NavIcon
              icon={<User size={20} className="md:w-6 md:h-6" />}
              active={activePanel === 'profile'}
              onClick={() => navigateToPanel('profile')}
              label="PROFILE"
            />
          </nav>

          <div className="flex-1 relative overflow-hidden">
            <AnimatePresence mode="wait">
              {activePanel === 'chats' && (
                <motion.div
                  key="chats"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="absolute inset-0"
                >
                  <ChatsPanel
                    user={user}
                    activeChat={activeChat}
                    setActiveChat={setActiveChat}
                    onChatSelect={handleChatSelection}
                    isAddingContact={isAddingContact}
                    setIsAddingContact={toggleAddingContact}
                    onChatStateChange={setIsChatOpen}
                    showToast={showToast}
                  />
                </motion.div>
              )}
              {activePanel === 'groups' && (
                <motion.div
                  key="groups"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="absolute inset-0"
                >
                  <GroupsStatusPanel user={user} />
                </motion.div>
              )}
              {activePanel === 'profile' && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="absolute inset-0"
                >
                  <ProfilePanel user={user} onLogout={handleLogout} showToast={showToast} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <AnimatePresence>
          {screenshotBlocked && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-[10000] flex flex-col items-center justify-center text-red"
            >
              <Shield size={64} className="mb-4 animate-bounce" />
              <h2 className="text-2xl font-display mb-2">SECURITY BREACH DETECTED</h2>
              <p className="font-mono text-sm uppercase tracking-widest">Screenshot attempt logged and blocked</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={window.innerWidth < 768
                ? { opacity: 0, y: -50, x: '-50%' }
                : { opacity: 0, x: 50, y: 0 }
              }
              animate={window.innerWidth < 768
                ? { opacity: 1, y: 0, x: '-50%' }
                : { opacity: 1, x: 0, y: 0 }
              }
              exit={window.innerWidth < 768
                ? { opacity: 0, scale: 0.9, x: '-50%' }
                : { opacity: 0, x: 20 }
              }
              className={`fixed z-[300] flex items-center gap-3 backdrop-blur-xl shadow-2xl transition-all duration-300
                ${window.innerWidth < 768
                  ? 'top-4 left-1/2 px-5 py-2.5 rounded-full border text-[10px] min-w-[200px] justify-center'
                  : 'bottom-10 right-6 px-6 py-4 rounded-lg border-l-4 w-80'
                }
                ${toast.type === 'error'
                  ? 'bg-red/10 border-red/40 text-red shadow-red/10'
                  : 'bg-cyan/10 border-cyan/40 text-cyan shadow-cyan/10'
                }`}
            >
              <div className={`shrink-0 ${window.innerWidth < 768 ? '' : 'p-2 bg-bg rounded-lg border border-inherit'}`}>
                {toast.type === 'error' ? <ShieldAlert size={18} /> : <Shield size={18} className="glow-text" />}
              </div>
              <div className="flex flex-col">
                {window.innerWidth >= 768 && (
                  <span className="text-[10px] font-display mb-0.5 opacity-50 tracking-tighter">
                    {toast.type === 'error' ? 'SYSTEM ALERT' : 'NETWORK SIGNAL'}
                  </span>
                )}
                <span className="text-[10px] md:text-sm font-display tracking-wider uppercase leading-tight">
                  {toast.message}
                </span>
              </div>
              {window.innerWidth < 768 && (
                <div className="absolute -bottom-px left-1/2 -translate-x-1/2 w-12 h-0.5 bg-inherit opacity-30 rounded-full" />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="hidden md:flex h-6 bg-bg3 border-t border-border items-center justify-between px-4 text-[8px] font-mono text-muted/50 uppercase tracking-widest z-50">
          <div>AES-256-GCM ENCRYPTION ACTIVE</div>
          <div>QUANT NETWORK STATUS: OPTIMAL</div>
          <div>GHOST MODE: ENABLED</div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

function NavIcon({ icon, active, onClick, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 md:gap-1 transition-all group relative ${active ? 'text-cyan' : 'text-muted hover:text-text'
        }`}
    >
      <div className={`p-2 md:p-3 rounded-lg border transition-all ${active ? 'border-cyan bg-cyan/10 shadow-glow-cyan' : 'border-transparent group-hover:border-border'
        }`}>
        {icon}
        {badge && (
          <span className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-red text-bg text-[10px] md:text-[12px] font-mono font-bold rounded-full flex items-center justify-center shadow-lg animate-pulse">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[7px] md:text-[8px] font-mono uppercase tracking-tighter">{label}</span>
    </button>
  );
}
