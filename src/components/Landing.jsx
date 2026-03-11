import React from 'react';
import { motion } from 'motion/react';
import { Shield, Lock, Zap, Trash2 } from 'lucide-react';

export default function Landing({ onNavigate }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-3 md:p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-2xl w-full"
      >
        <div className="flex items-center justify-center gap-2 md:gap-3 mb-3 md:mb-6">
          <Shield className="text-cyan w-8 h-8 md:w-12 md:h-12 glow-text" />
          <h1 className="text-3xl md:text-5xl font-display tracking-tighter glow-text">
            QUANT <span className="text-muted">CHAT</span>
          </h1>
        </div>

        <p className="text-[13px] md:text-xl text-muted font-body mb-3 md:mb-12 max-w-lg mx-auto px-4 leading-relaxed">
          The most secure communication protocol ever built.
          <span className="block mt-0.5 font-mono text-[9px] md:text-sm text-cyan/70 opacity-80 uppercase tracking-widest">
            Zero tracking. Zero logs. Zero identity.
          </span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-6 mb-5 md:mb-16 px-4">
          <FeatureCard
            icon={<Lock className="text-cyan w-4 h-4 md:w-6 md:h-6" />}
            title="3-Factor Auth"
            desc="QC Number + 10-digit Key + Pattern/Chess"
          />
          <FeatureCard
            icon={<Zap className="text-green w-4 h-4 md:w-6 md:h-6" />}
            title="Vanish Mode"
            desc="Messages exist only in RAM. No Firestore."
          />
          <FeatureCard
            icon={<Trash2 className="text-red w-4 h-4 md:w-6 md:h-6" />}
            title="Identity Erasure"
            desc="One-click permanent network purge."
          />
          <FeatureCard
            icon={<Shield className="text-yellow w-4 h-4 md:w-6 md:h-6" />}
            title="Ghost Mode"
            desc="Zero presence tracking. No online status."
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 md:gap-4 justify-center px-4">
          <button
            onClick={() => onNavigate('create')}
            className="px-6 md:px-10 py-3 md:py-4 bg-transparent border border-cyan text-cyan font-display text-sm md:text-lg glow-border hover:bg-cyan/10 transition-all active:scale-95"
          >
            CREATE IDENTITY
          </button>
          <button
            onClick={() => onNavigate('login')}
            className="px-6 md:px-10 py-3 md:py-4 bg-transparent border border-muted text-muted font-display text-sm md:text-lg hover:border-cyan hover:text-cyan transition-all active:scale-95"
          >
            RESTORE SESSION
          </button>
        </div>
      </motion.div>

      <div className="fixed bottom-3 md:bottom-8 text-[8px] md:text-[10px] font-mono text-muted/30 uppercase tracking-[0.2em] md:tracking-[0.3em] px-4 text-center">
        Quant Network Protocol v4.2.0-stable
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="p-3.5 md:p-6 bg-bg2 border border-border rounded-lg text-left hover:border-cyan/50 transition-all">
      <div className="mb-1.5 md:mb-3">{icon}</div>
      <h3 className="text-[11px] md:text-sm font-display mb-0.5">{title}</h3>
      <p className="text-[9px] md:text-xs text-muted font-mono leading-tight">{desc}</p>
    </div>
  );
}
