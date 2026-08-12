import { Sun, Moon } from 'lucide-react';
import { useState } from 'react';
import { useLanguage, type Language } from '@/contexts/language-context';
import { cn } from '@/lib/utils';

const LANGUAGES: Language[] = ['EN', 'DE', 'KO', 'JP'];

// Hardcoded demo user initials — replace with real auth when available
const USER_INITIALS = 'DK';

export function TopBar() {
  const { language, setLanguage } = useLanguage();
  const [darkMode, setDarkMode] = useState(false);

  const toggleDark = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  return (
    <div className="fixed top-0 right-0 z-50 flex items-center gap-1 px-3 py-2">
      {/* Language pills */}
      <div className="flex items-center bg-white/80 backdrop-blur-sm rounded-full border border-gray-200 shadow-sm px-1 py-1 gap-0.5">
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            onClick={() => setLanguage(lang)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-semibold transition-all select-none',
              language === lang
                ? 'bg-[#1e3a5f] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            )}
          >
            {lang}
          </button>
        ))}

        {/* Divider */}
        <div className="w-px h-4 bg-gray-200 mx-1" />

        {/* Dark / Light toggle */}
        <button
          onClick={toggleDark}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-gray-200 mx-1" />

        {/* User avatar */}
        <div className="w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-[10px] font-bold tracking-wide select-none">
          {USER_INITIALS}
        </div>
      </div>
    </div>
  );
}
