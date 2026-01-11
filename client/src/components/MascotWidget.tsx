import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface MascotWidgetProps {
  rescueName: string;
  speechText?: string;
  enabled?: boolean;
  tenantId?: string;
}

const DISMISS_STORAGE_KEY = 'mascot-dismissed';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function MascotWidget({ 
  rescueName, 
  speechText, 
  enabled = false,
  tenantId = 'default'
}: MascotWidgetProps) {
  const [isDismissed, setIsDismissed] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const storageKey = `${DISMISS_STORAGE_KEY}-${tenantId}`;
    const dismissedAt = localStorage.getItem(storageKey);
    
    if (dismissedAt) {
      const dismissTime = parseInt(dismissedAt, 10);
      const now = Date.now();
      if (now - dismissTime < DISMISS_DURATION_MS) {
        setIsDismissed(true);
        return;
      }
    }
    
    setIsDismissed(false);
  }, [tenantId]);

  const handleDismiss = () => {
    const storageKey = `${DISMISS_STORAGE_KEY}-${tenantId}`;
    localStorage.setItem(storageKey, Date.now().toString());
    setIsDismissed(true);
  };

  if (!enabled || isDismissed) {
    return null;
  }

  const displayText = speechText || `${rescueName} needs you!`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 100, scale: 0.8 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="fixed bottom-4 right-4 z-[2000] hidden md:block"
        data-testid="mascot-widget"
      >
        <div className="relative">
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            className="absolute top-4 right-4 z-10 h-6 w-6 rounded-full bg-background/90 shadow-md hover:bg-background"
            data-testid="button-dismiss-mascot"
            aria-label="Dismiss mascot"
          >
            <X className="h-3 w-3" />
          </Button>

          <div className="relative">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="absolute -top-16 right-0 whitespace-nowrap"
            >
              <div className="relative bg-white dark:bg-card rounded-xl px-4 py-2 shadow-lg border">
                <p className="text-sm font-medium text-foreground" data-testid="text-mascot-speech">
                  {displayText}
                </p>
                <div className="absolute -bottom-2 right-8 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white dark:border-t-card" />
              </div>
            </motion.div>

            <div 
              className="w-32 h-32 rounded-full overflow-hidden shadow-2xl border-4 border-white dark:border-card bg-muted"
              data-testid="mascot-video-container"
            >
              <video
                src="/mascot-dog.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                onLoadedData={() => setIsLoaded(true)}
                className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                data-testid="mascot-video"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
