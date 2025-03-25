
import { useState, useEffect, useRef } from 'react';

type CountdownOptions = {
  onComplete?: () => void;
  onTick?: (remaining: number) => void;
  refreshInterval?: number;
};

export function useCountdown(targetDate: Date, options: CountdownOptions = {}) {
  const { onComplete, onTick, refreshInterval = 1000 } = options;
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const targetTimeRef = useRef<number>(targetDate.getTime());

  // Update target time if the date changes
  useEffect(() => {
    const newTargetTime = targetDate.getTime();
    if (newTargetTime !== targetTimeRef.current) {
      targetTimeRef.current = newTargetTime;
      setIsComplete(false);
    }
  }, [targetDate]);

  // Calculate remaining time
  const calculateRemaining = () => {
    const now = Date.now();
    const remaining = Math.max(0, targetTimeRef.current - now);
    
    setTimeRemaining(remaining);
    
    if (onTick) {
      onTick(remaining);
    }
    
    if (remaining <= 0 && !isComplete) {
      setIsComplete(true);
      if (onComplete) {
        onComplete();
      }
    }
    
    return remaining;
  };

  // Set up and clean up the timer
  useEffect(() => {
    // Calculate immediately
    const remaining = calculateRemaining();
    
    // Only set up interval if not already completed
    if (remaining > 0 && !timerRef.current) {
      timerRef.current = window.setInterval(calculateRemaining, refreshInterval);
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [refreshInterval, isComplete, onComplete, onTick]);

  // Format time remaining into human-readable format
  const formatTimeRemaining = () => {
    if (timeRemaining <= 0) return 'now';
    
    const seconds = Math.floor(timeRemaining / 1000);
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return `${hours}h ${remainingMinutes}m`;
  };

  return {
    timeRemaining,
    isComplete,
    formatted: formatTimeRemaining(),
    resetCountdown: (newDate?: Date) => {
      if (newDate) {
        targetTimeRef.current = newDate.getTime();
      }
      setIsComplete(false);
      calculateRemaining();
    }
  };
}
