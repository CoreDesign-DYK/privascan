/**
 * update-banner.tsx
 * Slide-up banner shown when a new PWA version is waiting.
 * Appears at the bottom of the screen, above the safe area.
 */
import { X, RefreshCw, Sparkles } from 'lucide-react';
import { applyUpdate } from '@/lib/sw-registration';

interface Props {
  onDismiss: () => void;
}

export function UpdateBanner({ onDismiss }: Props) {
  function handleUpdate() {
    applyUpdate();
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] flex justify-center px-4 pb-safe"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        style={{ animation: 'slideUpIn 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        {/* Top accent bar */}
        <div className="h-0.5 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />

        <div className="flex items-center gap-3 px-4 py-3.5">
          {/* Icon */}
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Sparkles className="w-4.5 h-4.5 text-blue-500" style={{ width: 18, height: 18 }} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-900 leading-tight">
              Update Available
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
              A new version of PrivaScan is ready
            </p>
          </div>

          {/* Update button */}
          <button
            onClick={handleUpdate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 active:scale-95 transition-all shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            Update
          </button>

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0 ml-0.5"
            aria-label="Dismiss update"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
