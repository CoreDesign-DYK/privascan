/**
 * terms-agree-modal.tsx
 * Legal agreement step shown after the user picks a sign-in method.
 * All four checkboxes must be checked to enable "Agree and continue".
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

interface Props {
  provider: 'google' | 'apple' | 'phone' | 'email' | null;
  onClose: () => void;
}

const ITEMS = [
  { id: 'age',     label: "I'm at least 14 years old" },
  { id: 'terms',   label: <>I agree to PrivaScan's <a href="/terms-of-service" className="text-emerald-600 underline">Terms of Service</a></> },
  { id: 'privacy', label: <>I agree to PrivaScan's <a href="/privacy-policy" className="text-emerald-600 underline">Privacy Policy</a></> },
  { id: 'data',    label: 'I agree to PrivaScan\'s Consent to collection of data' },
];

export function TermsAgreeModal({ provider, onClose }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [, setLocation] = useLocation();

  if (!provider) return null;

  const allChecked = ITEMS.every(i => checked[i.id]);

  function toggle(id: string) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function handleAgree() {
    // TODO: trigger actual OAuth flow based on `provider`
    onClose();
    setLocation('/');
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      {/* Sheet */}
      <div
        className="w-full max-w-sm mx-auto rounded-t-3xl bg-white px-6 pt-6 pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-[17px] font-semibold text-gray-900 text-center mb-1">
          Please read and accept the terms
        </h2>
        <p className="text-[13px] text-gray-500 text-center mb-5 leading-snug">
          I'm at least 14 years old, I agree to PrivaScan's{' '}
          <a href="/terms-of-service" className="text-emerald-600 underline">Terms of Service</a>,{' '}
          <a href="/privacy-policy" className="text-emerald-600 underline">Privacy Policy</a>,{' '}
          Consent to collection of data
        </p>

        {/* Checkboxes */}
        <div className="space-y-3 mb-6">
          {ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className="flex items-start gap-3 w-full text-left"
            >
              {/* Circle checkbox */}
              <span className={cn(
                'mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 transition-colors',
                checked[item.id]
                  ? 'border-emerald-500 bg-emerald-500'
                  : 'border-gray-300 bg-white',
              )} />
              <span className="text-[13px] text-gray-700 leading-snug">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Agree button */}
        <button
          disabled={!allChecked}
          onClick={handleAgree}
          className={cn(
            'w-full py-3.5 rounded-2xl text-[15px] font-semibold transition-colors mb-3',
            allChecked
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed',
          )}
        >
          Agree and continue
        </button>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl text-[15px] font-medium text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
