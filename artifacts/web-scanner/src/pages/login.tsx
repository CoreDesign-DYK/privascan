/**
 * login.tsx — Login / Sign-up page
 * Reached by tapping any sign-in provider icon in the HomePopup header.
 */
import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Eye, EyeOff, ChevronLeft } from 'lucide-react';

/* ── Provider icons (reused from home-popup) ─────────────────────────────── */
const PROVIDERS = [
  {
    id: 'google',
    label: 'Google',
    bg: 'bg-white border-2 border-gray-300',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  {
    id: 'apple',
    label: 'Apple',
    bg: 'bg-black',
    icon: (
      <svg viewBox="0 0 814 1000" className="w-5 h-5 shrink-0" fill="white">
        <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-161.8-109.3-100.9-193.7-100.9-288.5c0-167.8 109.3-256.6 216.7-256.6 69.4 0 127.3 45.4 170.8 45.4 41.3 0 106.2-48 187.7-48C643.3 192.3 740.7 230.8 788.1 340.9zm-130.2-89.5c0-71.5 69.3-131.5 69.3-132.9 0-.6-.7-.6-1.3-.6-65.9 0-156.6 73.3-156.6 158.2 0 69.4 56.9 128.4 126.3 128.4 0 0 1.3 0 1.3-.6.1-1.4-38.9-81.6-39-153.5z"/>
      </svg>
    ),
  },
  {
    id: 'phone',
    label: 'Phone',
    bg: 'bg-blue-500',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <rect x="5" y="2" width="14" height="20" rx="2"/>
        <line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: 'email',
    label: 'Email',
    bg: 'bg-emerald-500',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
    ),
  },
];

export default function LoginScreen() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col px-6 pt-4 pb-10">

      {/* ── Top nav ── */}
      <button
        onClick={() => setLocation('/')}
        className="flex items-center gap-1 text-gray-500 hover:text-gray-800 transition-colors mb-6 self-start"
      >
        <ChevronLeft className="w-5 h-5" />
        <span className="text-sm font-medium">Back to Home</span>
      </button>

      {/* ── Title ── */}
      <h1 className="text-3xl font-bold text-gray-900 mb-1">Login</h1>
      <p className="text-sm text-gray-500 mb-8">
        Sign in to&nbsp; <span className="font-semibold text-gray-800">access more features</span>
      </p>

      {/* ── Provider icons ── */}
      <div className="flex items-center gap-3 mb-8">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            aria-label={`Sign in with ${p.label}`}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm transition-opacity active:opacity-70 ${p.bg}`}
          >
            {p.icon}
          </button>
        ))}
      </div>

      {/* ── Email ── */}
      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">Email</label>
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* ── Password ── */}
      <div className="mb-2">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 pr-12 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Forgot password ── */}
      <div className="flex justify-end mb-8">
        <button className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          Forgot your password?
        </button>
      </div>

      {/* ── Sign In button ── */}
      <button
        onClick={() => {/* TODO: implement auth */}}
        className="w-full py-4 rounded-xl bg-[#1e3a5f] hover:bg-[#162d4a] text-white font-bold text-base transition-colors shadow-md mb-6"
      >
        Sign In
      </button>

      {/* ── Sign up link ── */}
      <p className="text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <button className="text-blue-500 font-semibold hover:underline">
          Sign up
        </button>
      </p>
    </div>
  );
}
