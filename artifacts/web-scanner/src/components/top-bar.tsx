import { Sun, Moon } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useLanguage, type Language } from '@/contexts/language-context';
import { cn } from '@/lib/utils';

const LANGUAGES: Language[] = ['EN', 'DE', 'KO', 'JP'];
const USER_INITIALS = 'DK';

export function TopBar() {
  const { language, setLanguage } = useLanguage();
  const [darkMode, setDarkMode] = useState(false);
  const [location] = useLocation();

  // On the scanner screen the background is always dark — use light text
  const isScanner = location === '/';

  const toggleDark = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  return (
    <div className="fixed top-0 right-0 z-50 flex items-center gap-1 px-4 py-3 pr-8">
      <div className="flex items-center px-1 py-1 gap-0.5">
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            onClick={() => setLanguage(lang)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-semibold transition-all select-none',
              language === lang
                ? isScanner
                  ? 'bg-white/20 text-white shadow-sm backdrop-blur-sm border border-white/20'
                  : 'bg-[#1e3a5f] text-white shadow-sm'
                : isScanner
                  ? 'text-white/50 hover:text-white/90'
                  : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {lang}
          </button>
        ))}

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
