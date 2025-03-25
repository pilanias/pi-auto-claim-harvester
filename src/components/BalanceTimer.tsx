
import React, { useEffect, useState } from 'react';
import { useCountdown } from '@/hooks/useCountdown';
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
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return new Date() >= new Date(unlockTime);
  });
  
  const { formatted, isComplete } = useCountdown(new Date(unlockTime), {
    onComplete: () => {
      setIsUnlocked(true);
      if (onUnlock) {
        onUnlock();
      }
    },
    refreshInterval: 1000 // Update every second for smooth UI
  });

  // Handle the case where the balance is already unlocked
  useEffect(() => {
    if (new Date() >= new Date(unlockTime) && !isUnlocked) {
      setIsUnlocked(true);
      if (onUnlock) {
        onUnlock();
      }
    }
  }, [unlockTime, isUnlocked, onUnlock]);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Timer className="w-3 h-3" />
      <span className={`text-xs font-medium ${
        isUnlocked ? 'text-green-500' : 
        isComplete ? 'text-green-500' : 
        formatted.includes('m') ? 'text-amber-500' : ''
      }`}>
        {isUnlocked ? 'Unlocked' : formatted}
      </span>
    </div>
  );
};

export default BalanceTimer;
