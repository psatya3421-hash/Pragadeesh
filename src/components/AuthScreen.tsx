import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, User, ArrowRight, X } from 'lucide-react';
import { apiRequest, ApiError } from '../utils/api';
import type { UserSession } from '../types';

interface AuthScreenProps {
  onAuthenticated: (user: UserSession) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleName, setGoogleName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'signup' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        mode === 'signup' ? { name, email, password } : { email, password };
      const res = await apiRequest<{ user: UserSession }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ user: UserSession }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ email: googleEmail, name: googleName }),
      });
      setShowGoogleModal(false);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden border border-white/15 bg-[#0D2342]/80 backdrop-blur-xl shadow-2xl">
        {/* Left Visual Showcase */}
        <div className="lg:col-span-6 relative min-h-[260px] lg:min-h-[600px] flex flex-col justify-between p-8 overflow-hidden bg-[#08172C]">
          <img
            src="/src/assets/images/primex_hero_banner_1794619333485.jpg"
            alt="PRIME X INNOVATION studio showcase"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#08172C] via-[#0B1F3A]/60 to-transparent" />

          <div className="relative z-10 flex items-center gap-3">
            <img
              src="/src/assets/images/primex_gold_emblem_1794619333706.jpg"
              alt="PRIME X Crest"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-xl object-cover border border-[#D4AF37]/60 shadow-lg"
            />
            <span className="font-display text-lg font-bold tracking-wide text-[#F5C542]">
              PRIME X INNOVATION
            </span>
          </div>

          <div className="relative z-10 space-y-4 mt-12">
            <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight text-white [text-wrap:balance]">
              Commerce, Cinema Studio, and Live Mastery in One Unified Space.
            </h1>
            <p className="text-sm sm:text-base text-slate-200/90 max-w-md leading-relaxed">
              Access curated PRIME X projects, edit multi-track media inside our browser studio, and unlock live interactive classes.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-[#F5C542]/90 font-medium">
              <span>Projects Store</span>
              <span aria-hidden="true">·</span>
              <span>Media Studio</span>
              <span aria-hidden="true">·</span>
              <span>Live Classes</span>
            </div>
          </div>
        </div>

        {/* Right Authentication Form */}
        <div className="lg:col-span-6 p-7 sm:p-10 bg-white text-slate-900 flex flex-col justify-center">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#0B1F3A]">
                {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {mode === 'signin'
                  ? 'Persistent session keeps you signed in on this device.'
                  : 'Join PRIME X INNOVATION to shop, edit, and learn.'}
              </p>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
                className={`py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  mode === 'signin'
                    ? 'bg-[#0B1F3A] text-[#F5C542] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={`py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  mode === 'signup'
                    ? 'bg-[#0B1F3A] text-[#F5C542] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign Up
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your full name"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] font-display font-bold text-sm shadow-md hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span>
                  {loading
                    ? 'Please wait...'
                    : mode === 'signin'
                      ? 'Sign In'
                      : 'Create Account'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-xs text-slate-400 font-medium whitespace-nowrap">
                or continue with
              </span>
              <div className="border-t border-slate-200 w-full" />
            </div>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setShowGoogleModal(true);
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm flex items-center justify-center gap-3 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        </div>
      </div>

      {/* Google Account Sign-In Dialog */}
      {showGoogleModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="google-signin-title"
          className="fixed inset-0 z-50 bg-[#050F1E]/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 id="google-signin-title" className="font-display text-lg font-bold text-[#0B1F3A]">
                Continue with Google
              </h3>
              <button
                type="button"
                aria-label="Close Google sign-in modal"
                onClick={() => setShowGoogleModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Confirm your Google account details to sign in and establish a persistent session.
            </p>
            <form onSubmit={handleGoogleSubmit} className="space-y-4">
              <div>
                <label htmlFor="google-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Display Name
                </label>
                <input
                  id="google-name"
                  type="text"
                  required
                  value={googleName}
                  onChange={(e) => setGoogleName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                />
              </div>
              <div>
                <label htmlFor="google-email" className="block text-xs font-semibold text-slate-700 mb-1">
                  Google Email
                </label>
                <input
                  id="google-email"
                  type="email"
                  required
                  value={googleEmail}
                  onChange={(e) => setGoogleEmail(e.target.value)}
                  placeholder="name@gmail.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGoogleModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-sm font-bold shadow hover:brightness-105"
                >
                  {loading ? 'Signing in...' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
