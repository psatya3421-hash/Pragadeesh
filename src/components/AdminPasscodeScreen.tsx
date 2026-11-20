import React, { useState } from 'react';
import { KeyRound, LogOut, ShieldCheck, AlertTriangle } from 'lucide-react';
import { apiRequest, ApiError } from '../utils/api';
import type { UserSession } from '../types';

interface AdminPasscodeScreenProps {
  user: UserSession;
  onVerified: (updatedUser: UserSession) => void;
  onLogout: () => void;
}

export const AdminPasscodeScreen: React.FC<AdminPasscodeScreenProps> = ({
  user,
  onVerified,
  onLogout,
}) => {
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ user: UserSession }>('/api/admin/verify-passcode', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      });
      onVerified(res.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.status === 429 || err.data?.locked) {
          setLocked(true);
        }
      } else {
        setError('Unable to verify passcode.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-[#0D2342]/85 backdrop-blur-xl border border-[#D4AF37]/35 shadow-2xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#F5C542]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-white">
                Enter Admin Passcode
              </h1>
              <p className="text-xs text-slate-300">{user.email}</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">
          Administrator credentials detected. Verify your security passcode to unlock the PRIME X INNOVATION control center.
        </p>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-red-950/60 border border-red-400/40 text-red-200 text-sm flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-300" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label
              htmlFor="admin-passcode-input"
              className="block text-xs font-semibold text-[#F5C542] mb-1.5"
            >
              Security Passcode
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="admin-passcode-input"
                type="password"
                required
                disabled={locked || loading}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#08172C] border border-white/15 text-white font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F5C542] disabled:opacity-50"
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Maximum 5 attempts allowed before a 10-minute security lock.
            </p>
          </div>

          <button
            type="submit"
            disabled={locked || loading}
            className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] font-display font-bold text-sm shadow-lg hover:brightness-105 transition-all disabled:opacity-50"
          >
            {loading ? 'Verifying...' : locked ? 'Temporarily Locked' : 'Unlock Admin Portal'}
          </button>
        </form>

        <div className="pt-2 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
