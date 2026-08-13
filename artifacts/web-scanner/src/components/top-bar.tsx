import { Sun, Moon, Languages, Check } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useLanguage, LANGUAGES, type Language } from '@/contexts/language-context';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { SettingsSheet } from '@/components/settings-sheet';

const USER_INITIALS = 'DK';

export function TopBar() {
  const { language, setLanguage } = useLanguage();
  const [darkMode, setDarkMode] = useState(false);
  const [location] = useLocation();

  const isScanner = location === '/';

  const toggleDark = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  const currentLang = LANGUAGES.find(l => l.code === language)!;

  return (
    <div className="fixed top-0 right-0 z-50 flex items-center gap-1 px-4 py-3 pr-8">
      <div className="flex items-center px-1 py-1 gap-0.5">

        {/* Settings */}
        <div className={cn('text-white/80', !isScanner && 'text-gray-500')}>
          <SettingsSheet />
        </div>

        {/* Divider */}
        <div className={cn('w-px h-4 mx-1', isScanner ? 'bg-white/20' : 'bg-gray-200')} />

        {/* Language picker — single icon + popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition-all select-none',
                isScanner
                  ? 'text-white/80 hover:text-white hover:bg-white/15'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
              )}
              aria-label="Select language"
            >
              <Languages className="w-4 h-4" />
              <span>{currentLang.code}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="p-1 w-44 rounded-sm shadow-xl border border-border bg-background"
            align="end"
            sideOffset={8}
          >
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code as Language)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-1.5 rounded-sm text-sm transition-colors',
                  language === lang.code
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-foreground hover:bg-secondary',
                )}
              >
                <span>
                  <span className="font-mono text-xs text-muted-foreground mr-2">{lang.code}</span>
                  {lang.native}
                </span>
                {language === lang.code && <Check className="w-3.5 h-3.5 text-blue-500" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Divider */}
        <div className={cn('w-px h-4 mx-1', isScanner ? 'bg-white/20' : 'bg-gray-200')} />

        {/* Dark / Light toggle */}
        <button
          onClick={toggleDark}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-full transition-all',
            isScanner
              ? 'text-white/50 hover:text-white hover:bg-white/15'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
          )}
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>

        {/* Divider */}
        <div className={cn('w-px h-4 mx-1', isScanner ? 'bg-white/20' : 'bg-gray-200')} />

        {/* User avatar */}
        <div className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold tracking-wide select-none',
          isScanner ? 'bg-white/20 backdrop-blur-sm border border-white/20' : 'bg-[#1e3a5f]',
        )}>
          {USER_INITIALS}
        </div>
      </div>
    </div>
  );
}
