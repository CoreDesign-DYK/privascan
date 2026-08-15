/**
 * sign-in-sheet.tsx
 * Bottom sheet with 4 sign-in options. Selecting one opens the terms modal.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { TermsAgreeModal } from './terms-agree-modal';

type Provider = 'google' | 'apple' | 'phone' | 'email';

interface Props {
  onClose: () => void;
}

const METHODS: { id: Provider; label: string; icon: React.ReactNode; bg: string; text: string }[] = [
  {
    id: 'google',
    label: 'Continue with Google',
    bg: 'bg-emerald-500 hover:bg-emerald-600',
    text: 'text-white',
    icon: (
      <svg viewBox="0 0 48 48" className="w-5 h-5" fill="none">
        <path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.4-.2-2.7-.5-4z"/>
      </svg>
    ),
  },
  {
    id: 'apple',
    label: 'Continue with Apple',
    bg: 'bg-white hover:bg-gray-50 border border-gray-200',
    text: 'text-gray-900',
    icon: (
      <svg viewBox="0 0 814 1000" className="w-5 h-5" fill="currentColor">
        <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-161.8-109.3-100.9-193.7-100.9-288.5c0-167.8 109.3-256.6 216.7-256.6 69.4 0 127.3 45.4 170.8 45.4 41.3 0 106.2-48 187.7-48C643.3 192.3 740.7 230.8 788.1 340.9zm-130.2-89.5c0-71.5 69.3-131.5 69.3-132.9 0-.6-.7-.6-1.3-.6-65.9 0-156.6 73.3-156.6 158.2 0 69.4 56.9 128.4 126.3 128.4 0 0 1.3 0 1.3-.6.1-1.4-38.9-81.6-39-153.5z"/>
      </svg>
    ),
  },
  {
    id: 'phone',
    label: 'Continue with Phone Number',
    bg: 'bg-white hover:bg-gray-50 border border-gray-200',
    text: 'text-gray-900',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2"/>
        <line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: 'email',
    label: 'Continue with Email',
    bg: 'bg-white hover:bg-gray-50 border border-gray-200',
    text: 'text-gray-900',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
    ),
  },
];

export function SignInSheet({ onClose }: Props) {
  const [pending, setPending] = useState<Provider | null>(null);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      >
        {/* Sheet */}
        <div
          className="w-full max-w-sm mx-auto rounded-t-3xl bg-white px-5 pt-5 pb-10 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Handle + close */}
          <div className="flex items-center justify-between mb-5">
            <div className="w-8 h-1 rounded-full bg-gray-200 mx-auto" />
            <button
              onClick={onClose}
              className="absolute right-5 top-5 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Buttons */}
          <div className="space-y-3 mb-6">
            {METHODS.map(m => (
              <button
                key={m.id}
                onClick={() => setPending(m.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[15px] font-medium transition-colors ${m.bg} ${m.text}`}
              >
                <span className="w-6 flex items-center justify-center shrink-0">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          {/* Legal notice */}
          <p className="text-[11px] text-gray-400 text-center leading-relaxed">
            By signing in you agree to PrivaScan's{' '}
            <a href="/terms-of-service" className="underline">Terms of Service</a> and{' '}
            <a href="/privacy-policy" className="underline">Privacy Policy</a>.
          </p>
        </div>
      </div>

      {/* Terms modal */}
      {pending && (
        <TermsAgreeModal
          provider={pending}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
