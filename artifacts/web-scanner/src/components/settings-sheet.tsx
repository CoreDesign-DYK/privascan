import React from 'react';
import { Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScannerContext } from '@/contexts/scanner-context';
import { PAPER_SIZES, type PaperSize, type ImageQuality } from '@/lib/scanner-types';

export function SettingsSheet() {
  const { settings, setSettings } = useScannerContext();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
          <Settings2 className="h-6 w-6" />
          <span className="sr-only">Settings</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 rounded-xl shadow-2xl border border-border bg-background overflow-y-auto"
        style={{ height: '453px' }}
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
          {/* Scan Quality */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scan Quality</Label>
            <div className="flex gap-3">
              {([
                { value: 'high',   label: 'High',   sub: '0.95' },
                { value: 'medium', label: 'Medium', sub: '0.80' },
                { value: 'low',    label: 'Low',    sub: '0.60' },
              ] as { value: ImageQuality; label: string; sub: string }[]).map(({ value, label, sub }) => (
                <button
                  key={value}
                  onClick={() => setSettings({ imageQuality: value })}
                  className={`flex-1 flex flex-col items-center py-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                    settings.imageQuality === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-transparent bg-secondary text-foreground hover:border-muted-foreground/30'
                  }`}
                >
                  {label}
                  <span className="text-[10px] text-muted-foreground mt-0.5">q={sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color Mode */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color Mode</Label>
            <RadioGroup
              value={settings.colorMode}
              onValueChange={(val: 'color' | 'greyscale') => setSettings({ colorMode: val })}
              className="flex gap-3"
            >
              <div className="flex items-center space-x-2 bg-secondary p-3 rounded-lg flex-1">
                <RadioGroupItem value="color" id="c1" />
                <Label htmlFor="c1" className="cursor-pointer font-medium">Color</Label>
              </div>
              <div className="flex items-center space-x-2 bg-secondary p-3 rounded-lg flex-1">
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
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select paper size" />
              </SelectTrigger>
              <SelectContent>
                {PAPER_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
