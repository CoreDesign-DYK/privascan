import React, { useState } from 'react';
import { Settings2, Sun, Moon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScannerContext } from '@/contexts/scanner-context';
import { PAPER_SIZES, type PaperSize } from '@/lib/scanner-types';
import { useLanguage, LANGUAGES, type Language } from '@/contexts/language-context';

export function SettingsSheet() {
  const { settings, setSettings } = useScannerContext();
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
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
          <Settings2 className="h-6 w-6" />
          <span className="sr-only">Settings</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 rounded-sm shadow-2xl border border-border bg-background overflow-y-auto"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-5 pt-[30px] pb-3 border-b border-border">
          <p className="text-base font-semibold">Scanner Settings</p>
          <p className="text-sm text-muted-foreground">Configure your capture defaults.</p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">

          {/* Color Mode */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color Mode</Label>
            <RadioGroup
              value={settings.colorMode}
              onValueChange={(val: 'color' | 'greyscale') => setSettings({ colorMode: val })}
              className="flex gap-3"
            >
              <div className="flex items-center space-x-2 bg-secondary p-3 rounded-sm flex-1">
                <RadioGroupItem value="color" id="c1" />
                <Label htmlFor="c1" className="cursor-pointer font-medium">Color</Label>
              </div>
              <div className="flex items-center space-x-2 bg-secondary p-3 rounded-sm flex-1">
                <RadioGroupItem value="greyscale" id="c2" />
                <Label htmlFor="c2" className="cursor-pointer font-medium">Greyscale</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Paper Size */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Paper Size</Label>
            <Select
              value={settings.paperSize}
              onValueChange={(val: PaperSize) => setSettings({ paperSize: val })}
            >
              <SelectTrigger className="w-full rounded-sm">
                <SelectValue placeholder="Select paper size" />
              </SelectTrigger>
              <SelectContent>
                {PAPER_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Language</Label>
            <Select
              value={language}
              onValueChange={(val: Language) => setLanguage(val)}
            >
              <SelectTrigger className="w-full rounded-sm">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="font-mono text-xs text-muted-foreground mr-2">{lang.code}</span>
                    {lang.native}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Display */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Display</Label>
            <button
              onClick={toggleDark}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-sm bg-secondary hover:bg-secondary/80 transition-colors"
            >
              <span className="text-sm font-medium">{darkMode ? 'Dark mode' : 'Light mode'}</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </span>
            </button>
          </div>

        </div>
      </PopoverContent>
    </Popover>
  );
}
