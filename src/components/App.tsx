import React, { useState, useEffect } from 'react';
import Landing from './Landing.jsx';
import CreateIdentity from './CreateIdentity.jsx';
import Login from './Login.jsx';
import ProfilePanel from './panels/ProfilePanel.jsx';
import ChatsPanel from './panels/ChatsPanel.jsx';
import GroupsStatusPanel from './panels/GroupsStatusPanel.jsx';
import NotificationsPanel from './panels/NotificationsPanel.jsx';
import Watermark from './shared/Watermark.jsx';
import ErrorBoundary from './shared/ErrorBoundary.jsx';
import { initScreenshotPrevention } from '../utils/screenshotBlock';
import { Shield, User, MessageSquare, Globe, LogOut, Bell } from 'lucide-react';
import { collections, onSnapshot, query, where, handleFirestoreError, OperationType, collectionGroup, db } from '../firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

// Define the User type for QuantChat
interface UserData {
  qc: string;
  key?: string;
  data?: any;
}

export default function App() {
  const [view, setView] = useState<string>('landing');
  const [user, setUser] = useState<UserData | null>(null); 
  const [activePanel, setActivePanel] = useState<string>('chats');
  const [screenshotBlocked, setScreenshotBlocked] = useState<boolean>(false);
  const [pendingNotifications, setPendingNotifications] = useState<number>(0);
  const [totalUnreads, setTotalUnreads] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);

  // Sync Chat Requests (Real-time)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collections.chatRequests,
      where('to', '==', user.qc),
      where('status', '==', 'pending')
    );
    // Fixed: Added :any to snap and error to remove red lines
    const unsub = onSnapshot(q, (snap: any) => {
      setPendingNotifications(snap.docs.length);
    }, (error: any) => {
      handleFirestoreError(error, OperationType.LIST, 'chat_requests');
    });
    return unsub;
  }, [user]);

  // Sync Global Unreads (Real-time)
  useEffect(() => {
    if (!user) return;
    try {
      const q = query(
        collectionGroup(db, 'messages'),
        where('to', '==', user.qc),
        where('seenByRecipient', '==', false)
      );

      const unsub = onSnapshot(q, (snap: any) => {
        setTotalUnreads(snap.docs.length);
      }, (error: any) => {
        console.warn('Syncing Quant network message index...', error);
      });
      return unsub;
    } catch (e) {
      console.error('Quant network link failure:', e);
    }
  }, [user]);

  // Session Persistence
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

  // Security: Screenshot Prevention
  useEffect(() => {
    if (user) {
      const cleanup = initScreenshotPrevention(user.qc, () => {
        setScreenshotBlocked(true);
        setTimeout(() => setScreenshotBlocked(false), 3000);
      });
      return cleanup;
    }
  }, [user]);

  const handleAuthComplete = (userData: UserData) => {
    setUser(userData);
    localStorage.setItem('qc_session', JSON.stringify(userData));
    setView('main');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('qc_session');
    setView('landing');
  };

  if (view === 'landing') return <Landing onNavigate={setView} />;
  if (view === 'create') return <CreateIdentity onNavigate={setView} onComplete={handleAuthComplete} />;
  if (view === 'login') return <Login onNavigate={setView} onComplete={handleAuthComplete} />;

  return (
    <ErrorBoundary>
      <div id="qc-app" className="h-screen flex flex-col bg-bg overflow-hidden relative">
        <Watermark qcNumber={user?.qc} />
        <div className="scanline-overlay" />

        {/* Header */}
        <header className="h-14 md:h-16 border-b border-border bg-bg2 flex items-center justify-between px-4 md:px-6 z-50">
          <div className="flex items-center gap-2 md:gap-3">
            <Shield className="text-cyan w-5 h-5 md:w-6 md:h-6 glow-text" />
            <h1 className="text-base md:text-lg font-display tracking-wide glow-text">QUANT <span className="text-muted">CHAT</span></h1>
          </div>
          <div className="flex items-center gap-3 md:gap-6">
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-1.5 md:p-2 border transition-all relative ${showNotifications ? 'border-cyan bg-cyan/10 text-cyan' : 'border-border text-muted hover:text-cyan'}`}
              >
                <Bell size={16} />
                {pendingNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red text-bg text-[8px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {pendingNotifications}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="fixed left-4 right-4 top-16 sm:absolute sm:top-full sm:right-0 sm:mt-2 sm:w-96 h-[500px] bg-bg2 border border-border shadow-2xl z-[100] overflow-hidden rounded-lg origin-top-right"
                  >
                    <NotificationsPanel user={user} onClose={() => setShowNotifications(false)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] font-mono text-muted uppercase">Identity:</span>
              <span className="text-xs font-display text-cyan tracking-wider">{user?.qc}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 md:p-2 border border-red/30 text-red/50 hover:text-red hover:border-red transition-all"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <nav className="order-last md:order-first w-full md:w-20 h-16 md:h-full border-t md:border-t-0 md:border-r border-border bg-bg2 flex flex-row md:flex-col items-center justify-around md:justify-start md:py-8 md:gap-8 z-50">
            <NavIcon
              icon={<MessageSquare size={20} />}
              active={activePanel === 'chats'}
              onClick={() => setActivePanel('chats')}
              label="CHATS"
              badge={totalUnreads > 0 ? totalUnreads : null}
            />
            <NavIcon
              icon={<Globe size={20} />}
              active={activePanel === 'groups'}
              onClick={() => setActivePanel('groups')}
              label="GROUPS"
            />
            <NavIcon
              icon={<User size={20} />}
              active={activePanel === 'profile'}
              onClick={() => setActivePanel('profile')}
              label="PROFILE"
            />
          </nav>

          <div className="flex-1 relative overflow-hidden">
            <AnimatePresence mode="wait">
              {activePanel === 'chats' && (
                <motion.div key="chats" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="absolute inset-0">
                  <ChatsPanel user={user} />
                </motion.div>
              )}
              {activePanel === 'groups' && (
                <motion.div key="groups" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="absolute inset-0">
                  <GroupsStatusPanel user={user} />
                </motion.div>
              )}
              {activePanel === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="absolute inset-0">
                  <ProfilePanel user={user} onLogout={handleLogout} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <AnimatePresence>
          {screenshotBlocked && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black z-[10000] flex flex-col items-center justify-center text-red">
              <Shield size={64} className="mb-4 animate-bounce" />
              <h2 className="text-2xl font-display mb-2">SECURITY BREACH DETECTED</h2>
              <p className="font-mono text-sm uppercase tracking-widest">Screenshot attempt logged and blocked</p>
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

// NavIcon Interface for TS
interface NavIconProps {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number | null;
}

function NavIcon({ icon, active, onClick, label, badge }: NavIconProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 md:gap-1 transition-all group relative ${active ? 'text-cyan' : 'text-muted hover:text-text'}`}
    >
      <div className={`p-2 md:p-3 rounded-lg border transition-all ${active ? 'border-cyan bg-cyan/10 shadow-glow-cyan' : 'border-transparent group-hover:border-border'}`}>
        {icon}
        {badge && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red text-bg text-[8px] font-bold rounded-full flex items-center justify-center shadow-lg animate-pulse">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[7px] md:text-[8px] font-mono uppercase tracking-tighter">{label}</span>
    </button>
  );
}