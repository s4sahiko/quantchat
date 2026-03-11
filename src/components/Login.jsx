import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Key, Grid, Loader2, AlertCircle } from 'lucide-react';
import ChessBoard from './shared/ChessBoard';
import { collections, getDoc, doc } from '../firebase/firestore';
import bcrypt from 'bcryptjs';

export default function Login({ onComplete, onNavigate }) {
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
      const accountRef = doc(collections.accounts, qcNumber);
      const accountSnap = await getDoc(accountRef);

      if (!accountSnap.exists()) {
        throw new Error('Invalid credentials.');
      }

      const accountData = accountSnap.data();
      const pval = patternType === 'keyword' ? keyword : chessMoves.join('');

      // Verify hashes
      const keyMatch = bcrypt.compareSync(encryptionKey, accountData.keyHash);
      const pvalMatch = bcrypt.compareSync(pval, accountData.pvalHash);

      if (keyMatch && pvalMatch) {
        onComplete({ qc: qcNumber, key: encryptionKey, data: accountData });
      } else {
        const newAttempts = attempts - 1;
        setAttempts(newAttempts);
        if (newAttempts <= 0) {
          setLockout(Date.now() + 10 * 60000);
          setError('System locked for 10 minutes.');
        } else {
          setError(`Invalid credentials. ${newAttempts} attempts left.`);
        }
      }
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
            <label className="block text-[9px] md:text-[10px] text-muted font-mono uppercase mb-1.5 md:mb-2">Encryption Key:</label>
            <input
              type="password"
              required
              maxLength={10}
              value={encryptionKey}
              onChange={(e) => setEncryptionKey(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••••••"
              className="w-full text-center tracking-[0.4em] md:tracking-[0.5em] text-sm md:text-base"
            />
          </div>

          <div className="border-t border-border pt-4 md:pt-6">
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setPatternType('keyword')}
                className={`flex-1 py-2 font-display text-[9px] md:text-[10px] border ${
                  patternType === 'keyword' ? 'border-cyan text-cyan bg-cyan/10' : 'border-border text-muted'
                }`}
              >
                KEYWORD
              </button>
              <button
                type="button"
                onClick={() => setPatternType('chess')}
                className={`flex-1 py-2 font-display text-[9px] md:text-[10px] border ${
                  patternType === 'chess' ? 'border-cyan text-cyan bg-cyan/10' : 'border-border text-muted'
                }`}
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
