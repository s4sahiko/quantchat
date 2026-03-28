import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Key, Grid, Loader2, AlertCircle } from 'lucide-react';
import ChessBoard from './shared/ChessBoard';
import { collections, getDoc, doc, updateDoc } from '../firebase/firestore';
import bcrypt from 'bcryptjs';
import { decryptPrivateKey, importPrivateKey } from '../utils/encryption';
import { anonSignIn } from '../firebase/auth';

/**
 * FIXES APPLIED:
 * 1. After bcrypt verification, decrypts the stored encrypted private key
 *    using the user's (encryptionKey + pval) as the decryption password.
 * 2. Imports the decrypted JWK into a CryptoKey object that lives only in
 *    React memory — never serialized or stored.
 * 3. Passes { qc, privateKeyJwk, publicKeyJwk, data } to onComplete.
 *    The 10-digit key string itself is NOT passed forward or stored anywhere.
 * 4. If decryption fails (wrong password), the error is caught and shown
 *    as an auth failure — providing no information about which factor was wrong.
 */
export default function Login({ onComplete, onNavigate, showToast }) {
  const [qcNumber, setQcNumber] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [patternType, setPatternType] = useState('keyword');
  const [keyword, setKeyword] = useState('');
  const [chessMoves, setChessMoves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(3);
  const [lockout, setLockout] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (lockout && Date.now() < lockout) {
      const remaining = Math.ceil((lockout - Date.now()) / 60000);
      setError(`System locked. Try again in ${remaining} minutes.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Fetch account from Firestore
      const accountSnap = await getDoc(doc(collections.accounts, qcNumber));
      if (!accountSnap.exists()) {
        throw new Error('Invalid credentials.');
      }

      const accountData = accountSnap.data();
      const pval = patternType === 'keyword' ? keyword : chessMoves.join('');

      // 2. Verify bcrypt hashes (login verification only — NOT used for encryption)
      const keyMatch = bcrypt.compareSync(encryptionKey, accountData.keyHash);
      const pvalMatch = bcrypt.compareSync(pval, accountData.pvalHash);

      if (!keyMatch || !pvalMatch) {
        const newAttempts = attempts - 1;
        setAttempts(newAttempts);
        if (newAttempts <= 0) {
          setLockout(Date.now() + 10 * 60000);
          setError('System locked for 10 minutes.');
        } else {
          setError(`Invalid credentials. ${newAttempts} attempt${newAttempts === 1 ? '' : 's'} left.`);
        }
        return;
      }

      // 3. Decrypt the private key using the user's secret material
      //    This is the critical step: wrong key/pattern = decryption failure
      const privateKeyPassword = encryptionKey + pval;
      let privateKeyJwk;
      try {
        privateKeyJwk = await decryptPrivateKey(accountData.encryptedPrivateKey, privateKeyPassword);
      } catch {
        // Decryption failed — should not happen if bcrypt passed, but handle gracefully
        throw new Error('Key material mismatch. Contact support.');
      }

      // 4. Import the private key into a non-extractable CryptoKey
      const privateCryptoKey = await importPrivateKey(privateKeyJwk);

      // 5. Sign in anonymously to establish a Firebase Auth session.
      const authUser = await anonSignIn();

      // ✅ MIGRATION FIX: If the account document doesn't have a UID yet, save it now.
      // This allows legacy accounts to work with the new "owner-only" rules.
      if (!accountData.uid) {
        console.log('[MIGRATION] Saving UID to legacy account document...');
        try {
          // Use updateDoc (instead of setDoc) to only touch the UID field
          await updateDoc(doc(collections.accounts, qcNumber), { uid: authUser.uid });
        } catch (mErr) {
          console.error('[MIGRATION] Failed to update UID. Rules might be blocking it:', mErr);
          // If the update fails, we proceed, but security rules might block future writes.
        }
      }

      // 6. Complete authentication
      onComplete({
        qc: qcNumber,
        uid: authUser.uid, // ✅ CRITICAL: needed for firestore rules
        privateKey: privateCryptoKey,     // CryptoKey — in memory only
        privateKeyJwk,                    // JWK — kept briefly for sessionStorage backup
        publicKeyJwk: accountData.publicKeyJwk,
        data: { ...accountData, uid: authUser.uid },
      });

    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6">
      <div className="max-w-md w-full bg-bg2 border border-border p-6 md:p-8 rounded-lg shadow-2xl relative">
        <div className="flex items-center justify-center gap-2 md:gap-3 mb-6 md:mb-8">
          <Shield className="text-cyan w-6 h-6 md:w-8 md:h-8" />
          <h2 className="text-xl md:text-2xl font-display glow-text">RESTORE SESSION</h2>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 md:space-y-6">
          <div>
            <label className="block text-[9px] md:text-[10px] text-muted font-mono uppercase mb-1.5 md:mb-2">QuantC Number:</label>
            <input
              type="text"
              required
              value={qcNumber}
              onChange={(e) => setQcNumber(e.target.value.toUpperCase())}
              placeholder="QC-XXXXXXXXXX"
              className="w-full text-center font-display tracking-widest text-sm md:text-base"
            />
          </div>

          <div>
            <label className="block text-[9px] md:text-[10px] text-muted font-mono uppercase mb-1.5 md:mb-2">
              Encryption Key <span className="text-cyan/50">(used to unlock your private key)</span>:
            </label>
            <input
              type="password"
              required
              maxLength={64}
              value={encryptionKey}
              onChange={(e) => setEncryptionKey(e.target.value)}
              placeholder="Your encryption key"
              className="w-full text-center tracking-[0.4em] md:tracking-[0.5em] text-sm md:text-base"
            />
          </div>

          <div className="border-t border-border pt-4 md:pt-6">
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setPatternType('keyword')}
                className={`flex-1 py-2 font-display text-[9px] md:text-[10px] border ${patternType === 'keyword' ? 'border-cyan text-cyan bg-cyan/10' : 'border-border text-muted'}`}
              >
                KEYWORD
              </button>
              <button
                type="button"
                onClick={() => setPatternType('chess')}
                className={`flex-1 py-2 font-display text-[9px] md:text-[10px] border ${patternType === 'chess' ? 'border-cyan text-cyan bg-cyan/10' : 'border-border text-muted'}`}
              >
                CHESS
              </button>
            </div>

            {patternType === 'keyword' ? (
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full text-center text-sm md:text-base"
                placeholder="ENTER KEYWORD"
              />
            ) : (
              <div className="max-w-[280px] mx-auto overflow-hidden">
                <ChessBoard onMovesChange={setChessMoves} />
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red text-[10px] md:text-xs font-mono bg-red/10 p-2 md:p-3 border border-red/20">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 md:py-4 border border-cyan text-cyan font-display text-base md:text-lg hover:bg-cyan/10 shadow-glow-cyan disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 className="animate-spin mx-auto" /> : 'AUTHENTICATE'}
          </button>
        </form>

        <button
          onClick={() => onNavigate('landing')}
          className="w-full mt-4 md:mt-6 text-[9px] md:text-[10px] font-mono text-muted uppercase hover:text-cyan transition-all"
        >
          Back to Landing
        </button>
      </div>
    </div>
  );
}
