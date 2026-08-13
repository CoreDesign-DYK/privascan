import { createContext, useContext, useState, type ReactNode } from 'react';

export const LANGUAGES = [
  { code: 'EN', label: 'English',    native: 'English'    },
  { code: 'DE', label: 'German',     native: 'Deutsch'    },
  { code: 'FR', label: 'French',     native: 'Français'   },
  { code: 'ES', label: 'Spanish',    native: 'Español'    },
  { code: 'IT', label: 'Italian',    native: 'Italiano'   },
  { code: 'PT', label: 'Portuguese', native: 'Português'  },
  { code: 'RU', label: 'Russian',    native: 'Русский'    },
  { code: 'ZH', label: 'Chinese',    native: '中文'        },
  { code: 'JA', label: 'Japanese',   native: '日本語'      },
  { code: 'KO', label: 'Korean',     native: '한국어'      },
  { code: 'AR', label: 'Arabic',     native: 'العربية'    },
  { code: 'HI', label: 'Hindi',      native: 'हिन्दी'       },
  { code: 'NL', label: 'Dutch',      native: 'Nederlands' },
] as const;

export type Language = typeof LANGUAGES[number]['code'];

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('EN');
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
