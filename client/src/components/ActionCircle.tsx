import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

type ActionType = 'adopt' | 'foster' | 'volunteer' | 'donate';

interface ActionConfig {
  imageUrl?: string;
  title?: string;
  description?: string;
}

type CircleSize = 'sm' | 'md' | 'lg';

interface ActionCircleProps {
  actions?: {
    adopt?: ActionConfig;
    foster?: ActionConfig;
    volunteer?: ActionConfig;
    donate?: ActionConfig;
  };
  rotationSpeed?: number;
  size?: CircleSize;
  onActionClick?: (action: ActionType) => void;
  basePath?: string;
}

const SIZE_CLASSES: Record<CircleSize, string> = {
  sm: 'w-32 h-32 sm:w-36 sm:h-36 md:w-40 md:h-40 lg:w-44 lg:h-44',
  md: 'w-40 h-40 sm:w-44 sm:h-44 md:w-52 md:h-52 lg:w-56 lg:h-56',
  lg: 'w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 lg:w-72 lg:h-72',
};

// Text size classes based on circle size
// Short labels (adopt, donate): slightly reduced for smaller circles
// Long labels (volunteer, foster): 20% smaller for md, 40% smaller for sm vs lg
const LABEL_TEXT_CLASSES: Record<CircleSize, { short: string; long: string }> = {
  lg: {
    short: 'text-2xl sm:text-3xl md:text-4xl',
    long: 'text-2xl sm:text-3xl md:text-4xl',
  },
  md: {
    short: 'text-xl sm:text-2xl md:text-3xl',
    long: 'text-lg sm:text-xl md:text-2xl', // 20% smaller for long labels
  },
  sm: {
    short: 'text-lg sm:text-xl md:text-2xl',
    long: 'text-sm sm:text-base md:text-lg', // 40% smaller for long labels
  },
};

// Determine if a label is "long" (foster, volunteer)
const isLongLabel = (action: ActionType): boolean => {
  return action === 'foster' || action === 'volunteer';
};

const DEFAULT_ACTIONS: Record<ActionType, { label: string; title: string; description: string; path: string }> = {
  adopt: {
    label: 'ADOPT',
    title: 'Meet Your Match',
    description: 'See all available pets at our shelter and in foster care.',
    path: '/animals',
  },
  foster: {
    label: 'FOSTER',
    title: 'Open Your Home',
    description: 'Provide temporary love and care for animals in need.',
    path: '/foster',
  },
  volunteer: {
    label: 'VOLUNTEER',
    title: 'Make a Difference',
    description: 'Join our team and help save more lives.',
    path: '/volunteer',
  },
  donate: {
    label: 'DONATE',
    title: 'Support Our Mission',
    description: 'Your generosity helps us rescue and care for animals.',
    path: '/donate',
  },
};

const ACTION_ORDER: ActionType[] = ['adopt', 'foster', 'volunteer', 'donate'];

export default function ActionCircle({ 
  actions = {}, 
  rotationSpeed = 5,
  size = 'md',
  onActionClick,
  basePath = ''
}: ActionCircleProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Get active actions (ones with images configured)
  const activeActions = ACTION_ORDER.filter(action => actions[action]?.imageUrl);
  
  // If no actions configured, don't render
  if (activeActions.length === 0) {
    return null;
  }

  const currentAction = activeActions[currentIndex];
  const actionConfig = actions[currentAction];
  const defaultConfig = DEFAULT_ACTIONS[currentAction];

  // Auto-rotation effect
  useEffect(() => {
    if (isPaused || isHovered || activeActions.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeActions.length);
    }, rotationSpeed * 1000);

    return () => clearInterval(interval);
  }, [isPaused, isHovered, activeActions.length, rotationSpeed]);

  const handleClick = useCallback(() => {
    if (onActionClick) {
      onActionClick(currentAction);
    } else {
      window.location.href = `${basePath}${defaultConfig.path}`;
    }
  }, [currentAction, onActionClick, basePath, defaultConfig.path]);

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <div className="relative">
      {/* Main Circle Container */}
      <div
        className={`relative ${SIZE_CLASSES[size]} rounded-full overflow-hidden cursor-pointer shadow-2xl`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        data-testid="action-circle"
      >
        {/* Background Image with Animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentAction}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${actionConfig?.imageUrl})` }}
            />
            {/* Base teal overlay */}
            <div className="absolute inset-0 bg-teal-600/30" />
          </motion.div>
        </AnimatePresence>

        {/* Default State - Label Centered */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: isHovered ? 0 : 1 }}
          transition={{ duration: 0.3 }}
        >
          <span className={`text-white font-bold tracking-wider drop-shadow-lg ${
            isLongLabel(currentAction) 
              ? LABEL_TEXT_CLASSES[size].long 
              : LABEL_TEXT_CLASSES[size].short
          }`}>
            {defaultConfig.label}
          </span>
        </motion.div>

        {/* Hover State - Full Overlay with Content */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center text-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Blurred background overlay */}
          <div className="absolute inset-0 bg-teal-600/80 backdrop-blur-sm" />
          
          {/* Content */}
          <div className="relative z-10 space-y-3">
            <h3 className="text-white text-lg sm:text-xl md:text-2xl font-bold italic leading-tight">
              {actionConfig?.title || defaultConfig.title}
            </h3>
            <p className="text-white/90 text-xs sm:text-sm leading-relaxed max-w-[80%] mx-auto">
              {actionConfig?.description || defaultConfig.description}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 bg-amber-600 hover:bg-amber-700 text-white border-amber-600 hover:border-amber-700 font-semibold px-6"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              data-testid={`button-action-${currentAction}`}
            >
              {defaultConfig.label}
            </Button>
          </div>
        </motion.div>
      </div>

    </div>
  );
}
