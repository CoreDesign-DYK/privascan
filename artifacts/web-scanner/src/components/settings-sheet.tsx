import React from 'react';
import { Settings2 } from 'lucide-react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScannerContext } from '@/contexts/scanner-context';
import { PAPER_SIZES, type PaperSize } from '@/lib/scanner-types';

export function SettingsSheet() {
  const { settings, setSettings } = useScannerContext();

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
          <Settings2 className="h-6 w-6" />
          <span className="sr-only">Settings</span>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="bg-background" style={{ left: '35%', right: '35%' }}>
        <div className="mx-auto w-full">
          <DrawerHeader>
            <DrawerTitle>Scanner Settings</DrawerTitle>
            <DrawerDescription>Configure your capture defaults.</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 pb-0 space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Type</Label>
              <RadioGroup
                value={settings.scanType}
                onValueChange={(val: 'document' | 'photo') => setSettings({ scanType: val })}
                className="flex gap-4"
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

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Color Mode</Label>
              <RadioGroup
                value={settings.colorMode}
                onValueChange={(val: 'color' | 'greyscale') => setSettings({ colorMode: val })}
                className="flex gap-4"
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

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Paper Size</Label>
              <Select
                value={settings.paperSize}
                onValueChange={(val: PaperSize) => setSettings({ paperSize: val })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select paper size" />
                </SelectTrigger>
                <SelectContent>
                  {PAPER_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button className="w-full font-semibold">Done</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
