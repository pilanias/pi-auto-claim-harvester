
import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

interface BalanceTimerProps {
  unlockTime: Date;
  onUnlock?: () => void;
  className?: string;
}

const BalanceTimer: React.FC<BalanceTimerProps> = ({ 
  unlockTime, 
  onUnlock, 
  className = '' 
}) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    // Initialize state
    const updateTimer = () => {
      const now = Date.now();
      const target = new Date(unlockTime).getTime();
      const remaining = Math.max(0, target - now);
      setTimeRemaining(remaining);
      
      if (remaining <= 0 && !isUnlocked) {
        setIsUnlocked(true);
        if (onUnlock) {
          onUnlock();
        }
      }
    };
    
    // Initial calculation
    updateTimer();
    
    // Set up interval for continuous updates
    const intervalId = setInterval(updateTimer, 1000);
    
    // Clean up on unmount
    return () => clearInterval(intervalId);
  }, [unlockTime, onUnlock, isUnlocked]);

  // Format the remaining time
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

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Timer className="w-3 h-3" />
      <span className={`text-xs font-medium ${
        isUnlocked ? 'text-green-500' : 
        timeRemaining === 0 ? 'text-green-500' : 
        timeRemaining < 60000 ? 'text-amber-500' : ''
      }`}>
        {isUnlocked ? 'Unlocked' : formatTimeRemaining()}
      </span>
    </div>
  );
};

export default BalanceTimer;
