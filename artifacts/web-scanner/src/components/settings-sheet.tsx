import React, { useState } from 'react';
import { Settings2, Sun, Moon, ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useScannerContext } from '@/contexts/scanner-context';
import { PAPER_SIZES, type PaperSize } from '@/lib/scanner-types';
import { useLanguage, LANGUAGES, type Language } from '@/contexts/language-context';
import { cn } from '@/lib/utils';

/* ── Tiny dark select ────────────────────────────────────────────────────── */
function DarkSelect<T extends string>({
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
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-[10px] text-white font-semibold"
      >
        <span>{renderLabel ? renderLabel(value) : value}</span>
        <ChevronDown className={cn('w-4 h-4 text-white/40 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 right-0 mt-1 z-50 rounded-md overflow-y-auto py-1 max-h-56"
            style={{ background: 'rgba(22,22,26,0.98)', backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold transition-colors hover:bg-white/8 text-left"
              >
                <span className={cn(value === opt ? 'text-sky-400' : 'text-white/80')}>
                  {renderLabel ? renderLabel(opt) : opt}
                </span>
                {value === opt && <Check className="w-3.5 h-3.5 text-sky-400" />}
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
  const { language, setLanguage } = useLanguage();
  const [darkMode, setDarkMode] = useState(false);

  const toggleDark = () => {
    setDarkMode(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  const langLabel = (code: string) => {
    const l = LANGUAGES.find(l => l.code === code);
    return (
      <span className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-white/40">{code}</span>
        <span>{l?.native ?? code}</span>
      </span>
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
          <Settings2 className="h-6 w-6" />
          <span className="sr-only">Settings</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 overflow-visible"
        style={{
          background: 'rgba(16,16,20,0.97)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
        }}
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-5 pt-7 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[10px] font-semibold text-white">Scanner Settings</p>
          <p className="text-[10px] text-white/35 mt-0.5">Configure your capture defaults.</p>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">

          {/* Color Mode */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-widest text-white/35 uppercase">Color Mode</p>
            <div className="flex gap-2">
              {(['color', 'greyscale'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setSettings({ colorMode: mode })}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md border text-[10px] font-semibold transition-all',
                    settings.colorMode === mode
                      ? 'border-sky-400 bg-sky-400/10 text-sky-400'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
                  )}
                >
                  {/* Radio dot */}
                  <span className={cn(
                    'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all',
                    settings.colorMode === mode ? 'border-sky-400' : 'border-white/30',
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
            <p className="text-[10px] font-bold tracking-widest text-white/35 uppercase">Paper Size</p>
            <DarkSelect
              value={settings.paperSize}
              options={[...PAPER_SIZES] as PaperSize[]}
              onChange={(val: PaperSize) => setSettings({ paperSize: val })}
            />
          </div>

          {/* Language */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-widest text-white/35 uppercase">Language</p>
            <DarkSelect
              value={language}
              options={LANGUAGES.map(l => l.code) as Language[]}
              onChange={(val: Language) => setLanguage(val)}
              renderLabel={langLabel}
            />
          </div>

          {/* Display */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-widest text-white/35 uppercase">Display</p>
            <button
              onClick={toggleDark}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <span className="text-[10px] text-white/80 font-semibold">
                {darkMode ? 'Dark mode' : 'Light mode'}
              </span>
              {darkMode
                ? <Moon className="w-4 h-4 text-white/40" />
                : <Sun className="w-4 h-4 text-white/40" />}
            </button>
          </div>

        </div>
      </PopoverContent>
    </Popover>
  );
}
