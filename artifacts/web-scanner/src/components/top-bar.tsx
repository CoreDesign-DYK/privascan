import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { SettingsSheet } from '@/components/settings-sheet';

const USER_INITIALS = 'DK';

export function TopBar() {
  const [location] = useLocation();
  const isScanner = location === '/';

  return (
    <div className="fixed top-0 right-0 z-50 flex items-center gap-1 px-4 py-3 pr-8">
      <div className="flex items-center px-1 py-1 gap-0.5">

        {/* Settings */}
        <div className={cn('text-white/80', !isScanner && 'text-gray-500')}>
          <SettingsSheet />
        </div>

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
