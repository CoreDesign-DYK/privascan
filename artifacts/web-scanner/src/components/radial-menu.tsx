import { useState } from 'react';
import { Camera, Crop, RotateCw, Type, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RadialItem {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
}

interface RadialMenuProps {
  onRetake?: () => void;
  onCrop?: () => void;
  onRotate?: () => void;
  onMarkup?: () => void;
  onDelete?: () => void;
  /** The capture button rendered as children */
  children: React.ReactNode;
}

// 5 items spread in a fan arc above the button
// Angles measured from top (0° = straight up), spread from -70° to +70°
const ITEMS_CONFIG = [
  { angle: -70, label: 'Retake',  icon: <Camera   className="w-8 h-8" />, key: 'retake'  },
  { angle: -35, label: 'Crop',    icon: <Crop     className="w-8 h-8" />, key: 'crop'    },
  { angle:   0, label: 'Rotate',  icon: <RotateCw className="w-8 h-8" />, key: 'rotate'  },
  { angle:  35, label: 'Markup',  icon: <Type     className="w-8 h-8" />, key: 'markup'  },
  { angle:  70, label: 'Delete',  icon: <Trash2   className="w-8 h-8" />, key: 'delete', danger: true },
];

const RADIUS = 120; // px

function angleToXY(angleDeg: number) {
  // angleDeg: 0 = straight up, positive = clockwise
  // Convert to standard math angle (0 = right, CCW positive)
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: Math.cos(rad) * RADIUS,
    // sin gives: positive = down in math coords when angle > 180°
    // We want upward movement → keep as-is and ADD to top (CSS y↓)
    y: Math.sin(rad) * RADIUS,
  };
}

export function RadialMenu({
  onRetake, onCrop, onRotate, onMarkup, onDelete, children,
}: RadialMenuProps) {
  const [open, setOpen] = useState(false);

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
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      // Touch support: toggle on long-press / tap of the outer wrapper is handled via children click
    >
      {/* Radial items */}
      {ITEMS_CONFIG.map((item, i) => {
        const { x, y } = angleToXY(item.angle);
        return (
          <div
            key={item.key}
            className="absolute pointer-events-none flex flex-col items-center gap-1"
            style={{
              // Center of each item is offset from button center
              left: `calc(50% + ${x}px)`,
              top:  `calc(50% + ${y}px)`, // y is already negative for upward items
              transform: 'translate(-50%, -50%)',
              transition: `opacity 180ms ease ${i * 30}ms, transform 220ms cubic-bezier(0.34,1.56,0.64,1) ${i * 30}ms`,
              opacity: open ? 1 : 0,
              pointerEvents: open ? 'auto' : 'none',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlers[item.key]?.();
                setOpen(false);
              }}
              className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center shadow-lg',
                'transition-transform active:scale-90',
                item.danger
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              )}
              style={{
                transform: open
                  ? 'scale(1)'
                  : `scale(0.4) translate(${-x * 0.6}px, ${-y * 0.6}px)`,
                transition: `transform 220ms cubic-bezier(0.34,1.56,0.64,1) ${i * 30}ms`,
              }}
            >
              {item.icon}
            </button>
            {/* Label */}
            <span
              className={cn(
                'text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap select-none',
                'bg-gray-900/80 text-white backdrop-blur-sm',
                'transition-opacity'
              )}
              style={{ opacity: open ? 1 : 0 }}
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
