import { useState, useRef } from 'react';
import { Camera, Crop, RotateCw, Type, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RadialMenuProps {
  onRetake?: () => void;
  onCrop?: () => void;
  onRotate?: () => void;
  onMarkup?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}

// 70% of previous sizes: button w-20→w-14, icon w-8→w-6, radius 120→84
const ITEMS_CONFIG = [
  { angle: -70, label: 'Retake',  icon: <Camera   className="w-6 h-6" />, key: 'retake'               },
  { angle: -35, label: 'Crop',    icon: <Crop     className="w-6 h-6" />, key: 'crop'                 },
  { angle:   0, label: 'Rotate',  icon: <RotateCw className="w-6 h-6" />, key: 'rotate'               },
  { angle:  35, label: 'Markup',  icon: <Type     className="w-6 h-6" />, key: 'markup'               },
  { angle:  70, label: 'Delete',  icon: <Trash2   className="w-6 h-6" />, key: 'delete', danger: true },
];

const RADIUS = 130; // px

function angleToXY(angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: Math.cos(rad) * RADIUS,
    y: Math.sin(rad) * RADIUS, // negative = upward in CSS
  };
}

const CLOSE_DELAY = 250; // ms before menu hides after mouse leaves

export function RadialMenu({
  onRetake, onCrop, onRotate, onMarkup, onDelete, children,
}: RadialMenuProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  const handlers: Record<string, (() => void) | undefined> = {
    retake: onRetake,
    crop:   onCrop,
    rotate: onRotate,
    markup: onMarkup,
    delete: onDelete,
  };

  return (
    <div
      className="relative flex items-center justify-center"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      {/* Radial items */}
      {ITEMS_CONFIG.map((item, i) => {
        const { x, y } = angleToXY(item.angle);
        return (
          <div
            key={item.key}
            className="absolute flex flex-col items-center gap-1"
            style={{
              left: `calc(50% + ${x}px)`,
              top:  `calc(50% + ${y}px)`,
              transform: 'translate(-50%, -50%)',
              opacity: open ? 1 : 0,
              pointerEvents: open ? 'auto' : 'none',
              transition: `opacity 180ms ease ${i * 25}ms`,
            }}
            /* Keep menu alive while cursor is over an item */
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlers[item.key]?.();
                setOpen(false);
              }}
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center',
                'transition-transform active:scale-90',
                'shadow-[0_2px_12px_rgba(0,0,0,0.25)]',
                item.danger
                  ? 'bg-gray-900 text-white hover:bg-black'          // 휴지통: 검정 배경 + 흰 아이콘
                  : 'bg-black/20 backdrop-blur-md text-white hover:bg-black/35' // 나머지: 반투명
              )}
              style={{
                transform: open
                  ? 'scale(1)'
                  : `scale(0.4) translate(${-x * 0.5}px, ${-y * 0.5}px)`,
                transition: `transform 220ms cubic-bezier(0.34,1.56,0.64,1) ${i * 25}ms`,
              }}
            >
              {item.icon}
            </button>

            {/* Label */}
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap select-none bg-gray-900/80 text-white backdrop-blur-sm"
              style={{
                opacity: open ? 1 : 0,
                transition: `opacity 180ms ease ${i * 25}ms`,
              }}
            >
              {item.label}
            </span>
          </div>
        );
      })}

      {/* Capture button */}
      {children}
    </div>
  );
}
