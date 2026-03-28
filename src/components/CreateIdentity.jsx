import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Key, Grid, CheckCircle, Copy, Loader2, ChevronLeft } from 'lucide-react';
import ChessBoard from './shared/ChessBoard';
import bcrypt from 'bcryptjs';
import { collections, setDoc, doc, serverTimestamp } from '../firebase/firestore';
import { anonSignIn } from '../firebase/auth';
import {
  generateKeyPair,
  encryptPrivateKey,
  importPrivateKey,
} from '../utils/encryption';

/**
 * FIXES APPLIED:
 * 1. Generates a real ECDH P-256 key pair on identity creation.
 * 2. Stores the PUBLIC key in plaintext in Firestore (it's public by design).
 * 3. Stores the PRIVATE key encrypted with AES-256-GCM using a key derived
 *    from (encryptionKey + pval). The raw private key NEVER touches Firestore.
 * 4. The 10-digit key is now actually used as cryptographic material.
 */
export default function CreateIdentity({ onNavigate, onComplete, showToast }) {
  const [step, setStep] = useState(1);
  const [encryptionKey, setEncryptionKey] = useState('');
  const [patternType, setPatternType] = useState('keyword');
  const [keyword, setKeyword] = useState('');
  const [chessMoves, setChessMoves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [issuedQC, setIssuedQC] = useState(null);
  const [pendingAuth, setPendingAuth] = useState(null);
  const [error, setError] = useState('');

  const handleIssue = async () => {
    setLoading(true);
    setError('');
    try {
      const pval = patternType === 'keyword' ? keyword : chessMoves.join('');

      // 1. Hash the auth factors for login verification (bcrypt, never reversed)
      const keyHash = bcrypt.hashSync(encryptionKey, 12);
      const pvalHash = bcrypt.hashSync(pval, 12);

      // 2. Generate a real ECDH key pair — THIS is the fix for E2E encryption
      const { publicKeyJwk, privateKeyJwk } = await generateKeyPair();

      // 3. Encrypt the private key with the user's secret material
      //    Password = encryptionKey + pval — both factors are now used cryptographically
      const privateKeyPassword = encryptionKey + pval;
      const encryptedPrivateKey = await encryptPrivateKey(privateKeyJwk, privateKeyPassword);

      // 4. Sign in anonymously to get a Firebase Auth token.
      //    uid is stored in the account doc — Firestore rules use this for owner verification.
      const anonUser = await anonSignIn();

      // 5. Generate a unique QC number
      const randomNum = Math.floor(1000000000 + Math.random() * 9000000000);
      const qc = `QC-${randomNum}`;

      // 6. Store in Firestore:
      //    - publicKeyJwk: safe to store openly (ECDH public keys are meant to be shared)
      //    - encryptedPrivateKey: AES-256-GCM encrypted blob; useless without the password
      //    - keyHash / pvalHash: bcrypt hashes for login verification only
      //    The RAW private key JWK is NEVER sent to Firestore
      await setDoc(doc(collections.accounts, qc), {
        qc,
        uid: anonUser.uid,   // Firebase Auth uid — used by Firestore rules for owner-only updates
        keyHash,
        pvalHash,
        ptype: patternType,
        publicKeyJwk,        // ✅ Public key — safe to store openly
        encryptedPrivateKey, // ✅ Private key encrypted at rest
        createdAt: serverTimestamp(),
        autoDelete: 'OFF',
        notes: [],
        blocked: [],
      });

      // 6. Import the private key into a CryptoKey (in memory only, never persisted).
      //    This matches what Login.jsx provides, so handleAuthComplete correctly
      //    sets user.privateKey as a CryptoKey for ECDH operations.
      const privateCryptoKey = await importPrivateKey(privateKeyJwk);

      setIssuedQC(qc);
      setPendingAuth({
        qc,
        uid: anonUser.uid, // ✅ CRITICAL: needed for firestore rules
        privateKey: privateCryptoKey,  // CryptoKey — for ECDH in ChatsPanel
        privateKeyJwk,                 // JWK — stripped by handleAuthComplete before persist
        publicKeyJwk,
        data: { ptype: patternType, autoDelete: 'OFF', notes: [], blocked: [], encryptedPrivateKey, uid: anonUser.uid }
      });
      setStep(4);

    } catch (err) {
      console.error('Identity Creation Error:', err);
      if (err.message?.includes('auth/operation-not-allowed')) {
        setError('Anonymous Auth is not enabled in Firebase Console.');
      } else if (err.message?.includes('permission-denied')) {
        setError('Firestore permission denied. Please deploy rules.');
      } else {
        setError('Failed to initialize identity: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step === 1) {
      if (encryptionKey.length < 12) {
        setError('Key must be at least 12 characters.');
        return;
      }
    }
    if (step === 2) {
      if (patternType === 'keyword' && keyword.length < 6) {
        setError('Keyword must be at least 6 characters.');
        return;
      }
      if (patternType === 'chess' && chessMoves.length < 6) {
        setError('Minimum 6 moves required.');
        return;
      }
    }
    setError('');
    setStep(step + 1);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(issuedQC);
    showToast?.('QC Number copied to clipboard.', 'info');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6">
      <div className="max-w-md w-full bg-bg2 border border-border p-6 md:p-8 rounded-lg shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-right from-transparent via-cyan to-transparent opacity-50" />

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6 text-cyan">
                <Key size={20} className="md:w-6 md:h-6" />
                <h2 className="text-lg md:text-xl font-display">Step 1: Encryption Key</h2>
              </div>
              <p className="text-muted text-[11px] md:text-sm mb-4 md:mb-6 font-mono leading-relaxed">
                Enter a strong key (min 12 characters). Mix letters, numbers, and symbols for
                maximum strength. This <strong className="text-cyan">encrypts your private key</strong> and
                is NEVER stored. Losing it means permanent account loss.
              </p>
              <input
                type="password"
                maxLength={64}
                value={encryptionKey}
                onChange={(e) => setEncryptionKey(e.target.value)}
                placeholder="e.g. Tr0ub4dor&3_ghost"
                className="w-full text-center text-base md:text-lg tracking-widest mb-2"
              />
              <p className={`text-[9px] font-mono mb-4 ${
                encryptionKey.length === 0 ? 'text-muted' :
                encryptionKey.length < 12 ? 'text-red' :
                encryptionKey.length < 20 ? 'text-yellow-400' : 'text-green'
              }`}>
                {encryptionKey.length === 0 ? 'Minimum 12 characters' :
                 encryptionKey.length < 12 ? `Too short — ${12 - encryptionKey.length} more chars needed` :
                 encryptionKey.length < 20 ? 'Acceptable — longer is stronger' : 'Strong key ✓'}
              </p>
              {error && <p className="text-red text-[10px] md:text-xs mb-4 font-mono">{error}</p>}
              <button
                onClick={nextStep}
                className="w-full py-2.5 md:py-3 border border-cyan text-cyan font-display text-sm md:text-base hover:bg-cyan/10 transition-all"
              >
                CONTINUE
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6 text-cyan">
                <Grid size={20} className="md:w-6 md:h-6" />
                <h2 className="text-lg md:text-xl font-display">Step 2: Pattern</h2>
              </div>
              <div className="flex gap-2 mb-4 md:mb-6">
                <button
                  onClick={() => setPatternType('keyword')}
                  className={`flex-1 py-1.5 md:py-2 font-display text-[10px] md:text-xs border ${patternType === 'keyword' ? 'border-cyan text-cyan bg-cyan/10' : 'border-border text-muted'}`}
                >
                  KEYWORD
                </button>
                <button
                  onClick={() => setPatternType('chess')}
                  className={`flex-1 py-1.5 md:py-2 font-display text-[10px] md:text-xs border ${patternType === 'chess' ? 'border-cyan text-cyan bg-cyan/10' : 'border-border text-muted'}`}
                >
                  CHESS
                </button>
              </div>

              {patternType === 'keyword' ? (
                <div className="mb-4 md:mb-6">
                  <p className="text-muted text-[10px] md:text-xs mb-2 font-mono uppercase">Secret Keyword (min 6 chars):</p>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="w-full text-center text-sm md:text-base"
                    placeholder="PHANTOM_PROTOCOL"
                  />
                </div>
              ) : (
                <div className="mb-4 md:mb-6 max-w-[280px] mx-auto overflow-hidden">
                  <ChessBoard onMovesChange={setChessMoves} />
                </div>
              )}

              {error && <p className="text-red text-[10px] md:text-xs mb-4 font-mono">{error}</p>}

              <div className="flex gap-2 md:gap-3">
                <button onClick={() => setStep(1)} className="p-2.5 md:p-3 border border-border text-muted hover:text-text">
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={nextStep}
                  className="flex-1 py-2.5 md:py-3 border border-cyan text-cyan font-display text-sm md:text-base hover:bg-cyan/10 transition-all"
                >
                  CONTINUE
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="text-center"
            >
              <div className="flex flex-col items-center gap-3 md:gap-4 mb-6 md:mb-8">
                <Shield size={40} className="md:w-12 md:h-12 text-cyan animate-pulse" />
                <h2 className="text-lg md:text-xl font-display">Initialize Identity</h2>
                <p className="text-muted text-[11px] md:text-sm font-mono leading-relaxed px-2">
                  An ECDH P-256 key pair will be generated in your browser.
                  Your private key will be encrypted before leaving this device.
                </p>
              </div>

              {error && <p className="text-red text-[11px] md:text-sm mb-6 font-mono bg-red/5 p-2 border border-red/20">{error}</p>}

              {loading ? (
                <div className="flex flex-col items-center gap-3 md:gap-4 py-6 md:py-8">
                  <Loader2 className="text-cyan animate-spin" size={28} />
                  <p className="text-[10px] md:text-xs font-mono text-cyan uppercase tracking-widest">Generating key pair...</p>
                </div>
              ) : (
                <button
                  onClick={handleIssue}
                  className="w-full py-3 md:py-4 border border-cyan text-cyan font-display text-base md:text-lg hover:bg-cyan/10 shadow-glow-cyan transition-all"
                >
                  CONFIRM & ISSUE
                </button>
              )}

              {!loading && (
                <button onClick={() => setStep(2)} className="mt-4 text-[10px] md:text-xs font-mono text-muted uppercase hover:text-cyan transition-all">
                  Back to Pattern
                </button>
              )}
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <CheckCircle size={40} className="md:w-12 md:h-12 text-green mx-auto mb-3 md:mb-4" />
              <h2 className="text-lg md:text-xl font-display text-green mb-1 md:mb-2">Identity Issued</h2>
              <p className="text-muted text-[10px] md:text-xs font-mono mb-6 md:mb-8">
                Save this number. It is your only public identifier.
              </p>

              <div className="bg-bg3 border border-cyan/30 p-3 md:p-4 rounded mb-4 flex items-center justify-between">
                <span className="text-lg md:text-xl font-display text-cyan tracking-wider">{issuedQC}</span>
                <button onClick={copyToClipboard} className="text-muted hover:text-cyan p-1">
                  <Copy size={18} className="md:w-5 md:h-5" />
                </button>
              </div>

              {/* Security info card */}
              <div className="bg-cyan/5 border border-cyan/20 p-3 rounded mb-4 text-left">
                <p className="text-[9px] md:text-[10px] text-cyan font-mono uppercase font-bold mb-1">E2E Key Generated:</p>
                <p className="text-[9px] md:text-[10px] text-cyan/70 font-mono leading-relaxed">
                  ECDH P-256 key pair generated locally. Private key encrypted
                  with your 10-digit key + pattern before storage. Raw key never transmitted.
                </p>
              </div>

              <div className="bg-red/10 border border-red/30 p-3 md:p-4 rounded mb-6 md:mb-8 text-left">
                <p className="text-[9px] md:text-[10px] text-red font-mono uppercase font-bold mb-1">Warning:</p>
                <p className="text-[9px] md:text-[10px] text-red/80 font-mono leading-relaxed">
                  If you lose your 10-digit key or pattern, your private key cannot be
                  recovered. There is no reset. There is no recovery.
                </p>
              </div>
              
              <button
                onClick={() => onComplete(pendingAuth)}
                className="w-full py-3 md:py-4 bg-cyan text-bg font-display text-base md:text-lg hover:bg-cyan/80 transition-all font-bold"
              >
                ENTER NETWORK
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
