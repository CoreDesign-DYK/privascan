import React from 'react';
import { Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScannerContext } from '@/contexts/scanner-context';
import { PAPER_SIZES, type PaperSize } from '@/lib/scanner-types';

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
          {/* Type */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</Label>
            <RadioGroup
              value={settings.scanType}
              onValueChange={(val: 'document' | 'photo') => setSettings({ scanType: val })}
              className="flex gap-3"
            >
              <div className="flex items-center space-x-2 bg-secondary p-3 rounded-lg flex-1">
                <RadioGroupItem value="document" id="r1" />
                <Label htmlFor="r1" className="cursor-pointer font-medium">Document</Label>
              </div>
              <div className="flex items-center space-x-2 bg-secondary p-3 rounded-lg flex-1">
                <RadioGroupItem value="photo" id="r2" />
                <Label htmlFor="r2" className="cursor-pointer font-medium">Photo</Label>
              </div>
            </RadioGroup>
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
