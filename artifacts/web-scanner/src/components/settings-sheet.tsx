import React, { useState } from 'react';
import { SlidersHorizontal, Sun, Moon, ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useScannerContext } from '@/contexts/scanner-context';
import { PAPER_SIZES, type PaperSize } from '@/lib/scanner-types';
import { cn } from '@/lib/utils';

/* ── Light select ─────────────────────────────────────────────────────────── */
function LightSelect<T extends string>({
  value,
  options,
  onChange,
  renderLabel,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  renderLabel?: (v: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-[11px] text-gray-700 font-semibold"
      >
        <span>{renderLabel ? renderLabel(value) : value}</span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 right-0 mt-1 z-50 rounded-xl overflow-y-auto py-1 max-h-56 bg-white border border-gray-200"
            style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
          >
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold transition-colors hover:bg-gray-50 text-left"
              >
                <span className={cn(value === opt ? 'text-sky-500' : 'text-gray-700')}>
                  {renderLabel ? renderLabel(opt) : opt}
                </span>
                {value === opt && <Check className="w-3.5 h-3.5 text-sky-500" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function SettingsSheet() {
  const { settings, setSettings } = useScannerContext();
  const [darkMode, setDarkMode] = useState(false);

  const toggleDark = () => {
    setDarkMode(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
          <SlidersHorizontal className="w-5 h-5" />
          <span className="sr-only">Settings</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 overflow-visible bg-white border border-gray-200 rounded-2xl"
        style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.14)' }}
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <p className="text-[13px] font-bold text-gray-900">Scanner Settings</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Configure your capture defaults.</p>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">

          {/* Color Mode */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Color Mode</p>
            <div className="flex gap-2">
              {(['color', 'greyscale'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setSettings({ colorMode: mode })}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[11px] font-semibold transition-all',
                    settings.colorMode === mode
                      ? 'border-sky-400 bg-sky-50 text-sky-500'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  <span className={cn(
                    'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all',
                    settings.colorMode === mode ? 'border-sky-400' : 'border-gray-300',
                  )}>
                    {settings.colorMode === mode && (
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    )}
                  </span>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Paper Size */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Paper Size</p>
            <LightSelect
              value={settings.paperSize}
              options={[...PAPER_SIZES] as PaperSize[]}
              onChange={(val: PaperSize) => setSettings({ paperSize: val })}
            />
          </div>

          {/* Display */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Display</p>
            <button
              onClick={toggleDark}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-[11px] text-gray-700 font-semibold">
                {darkMode ? 'Dark mode' : 'Light mode'}
              </span>
              {darkMode
                ? <Moon className="w-4 h-4 text-gray-400" />
                : <Sun className="w-4 h-4 text-gray-400" />}
            </button>
          </div>

        </div>
      </PopoverContent>
    </Popover>
  );
}
