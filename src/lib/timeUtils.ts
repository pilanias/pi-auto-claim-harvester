
import { useState, useEffect, useRef } from 'react';

// Network time offset (difference between local time and network time)
let networkTimeOffset = 0;

/**
 * Sync local time with network time
 * Uses the Date header from a network response to calculate the offset
 */
export const syncNetworkTime = async (): Promise<number> => {
  try {
    const startTime = Date.now();
    const response = await fetch('https://api.mainnet.minepi.com', {
      method: 'HEAD',
    });
    const endTime = Date.now();
    const roundTripTime = endTime - startTime;
    
    // Get the server time from the Date header
    const serverTimeStr = response.headers.get('date');
    if (!serverTimeStr) {
      console.warn('No date header in response, using local time');
      return 0;
    }
    
    // Parse the server time
    const serverTime = new Date(serverTimeStr).getTime();
    
    // Calculate the offset (accounting for round trip time)
    // We assume the request and response times are roughly equal
    const localTimeAtResponse = startTime + (roundTripTime / 2);
    const calculatedOffset = serverTime - localTimeAtResponse;
    
    // Update the global offset
    networkTimeOffset = calculatedOffset;
    
    console.log(`Network time synced. Offset: ${networkTimeOffset}ms`);
    return networkTimeOffset;
  } catch (error) {
    console.error('Failed to sync network time:', error);
    return networkTimeOffset;
  }
};

/**
 * Get the current network time (adjusted local time)
 */
export const getNetworkTime = (): Date => {
  return new Date(Date.now() + networkTimeOffset);
};

/**
 * Calculate remaining time until a target date
 */
export const getTimeRemaining = (targetDate: Date): number => {
  const now = getNetworkTime();
  return targetDate.getTime() - now.getTime();
};

/**
 * Format milliseconds to a human-readable time string
 */
export const formatTimeRemaining = (milliseconds: number): string => {
  if (milliseconds < 0) return 'now';
  
  const seconds = Math.floor(milliseconds / 1000);
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

/**
 * Custom hook to continuously update a countdown timer
 * @param targetTime The target time to count down to
 * @param interval The update interval in milliseconds (default: 1000ms)
 * @returns Formatted time remaining and raw milliseconds
 */
export function useCountdown(targetTime: Date, interval = 1000) {
  const [timeRemaining, setTimeRemaining] = useState<number>(getTimeRemaining(targetTime));
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Immediately calculate the time remaining
    setTimeRemaining(getTimeRemaining(targetTime));
    
    // Create a timer that updates more frequently when close to zero
    const updateTimer = () => {
      const remaining = getTimeRemaining(targetTime);
      setTimeRemaining(remaining);
      
      // Dynamically adjust update frequency based on time remaining
      const nextInterval = remaining < 10000 ? 100 : interval;
      
      timerRef.current = setTimeout(updateTimer, nextInterval);
    };
    
    // Start the timer
    timerRef.current = setTimeout(updateTimer, interval);
    
    // Clean up on unmount
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [targetTime, interval]);

  return {
    formatted: formatTimeRemaining(timeRemaining),
    milliseconds: timeRemaining,
    isExpired: timeRemaining <= 0
  };
}

/**
 * Exponential backoff utility for retrying failed API calls
 * @param fn The function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 * @returns A function that will retry with exponential backoff
 */
export const withExponentialBackoff = async <T,>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelay = 1000
): Promise<T> => {
  let retries = 0;
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      
      if (retries > maxRetries) {
        console.error(`Failed after ${maxRetries} retries:`, error);
        throw error;
      }
      
      // Calculate exponential backoff delay
      const delay = baseDelay * Math.pow(2, retries - 1);
      
      // Add some randomness to prevent thundering herd
      const jitter = Math.random() * 0.3 * delay;
      const finalDelay = delay + jitter;
      
      console.log(`Retry ${retries}/${maxRetries} after ${finalDelay.toFixed(0)}ms`);
      
      // Wait for the backoff period
      await new Promise(resolve => setTimeout(resolve, finalDelay));
    }
  }
};
