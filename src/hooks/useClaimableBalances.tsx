import { useState, useEffect, useCallback, useRef } from 'react';
import { ClaimableBalance, WalletData } from '@/lib/types';
import { fetchClaimableBalances } from '@/lib/api';
import { toast } from 'sonner';

export function useClaimableBalances(wallets: WalletData[], addLog: Function) {
  const [claimableBalances, setClaimableBalances] = useState<ClaimableBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const walletLastCheckedRef = useRef<Record<string, number>>({});
  const scheduledChecksRef = useRef<Record<string, NodeJS.Timeout>>({});
  const initialFetchDoneRef = useRef<boolean>(false);
  const previousWalletCountRef = useRef<number>(0);
  const throttledLogTimeRef = useRef<number>(0);

  // Helper function to extract the correct unlock time from predicate
  const extractUnlockTime = (record: any): Date => {
    // Check if we have claimants
    if (!record.claimants || record.claimants.length === 0) {
      return new Date(Date.now() + 1000 * 60 * 60 * 24); // Default to 24 hours from now if no claimants
    }

    try {
      // Look for our wallet's claimant (usually first one)
      const claimant = record.claimants[0];
      
      // If it has a "not" predicate (meaning it can only be claimed after a certain time)
      if (claimant.predicate?.not?.abs_before) {
        return new Date(claimant.predicate.not.abs_before);
      }
      
      // If there's a second claimant with a "not" predicate, check that as well
      // This is the case in the example provided by the user
      if (record.claimants.length > 1 && record.claimants[1].predicate?.not?.abs_before) {
        return new Date(record.claimants[1].predicate.not.abs_before);
      }
      
      // Default fallback if we can't determine
      return new Date(Date.now() + 1000 * 60 * 60 * 24); // Default to 24 hours from now
    } catch (error) {
      console.error("Error extracting unlock time:", error);
      return new Date(Date.now() + 1000 * 60 * 60 * 24); // Default to 24 hours from now on error
    }
  };

  // Throttled logging to prevent excessive console output
  const throttledLog = useCallback((message: string, minInterval = 5000) => {
    const now = Date.now();
    if (now - throttledLogTimeRef.current > minInterval) {
      console.log(message);
      throttledLogTimeRef.current = now;
    }
  }, []);

  // Schedule checks based on unlock times
  const scheduleChecksBasedOnUnlockTimes = useCallback((balances: ClaimableBalance[]) => {
    // Clear any existing scheduled checks
    Object.values(scheduledChecksRef.current).forEach(timeoutId => clearTimeout(timeoutId));
    scheduledChecksRef.current = {};
    
    // Find the soonest unlocking balance for each wallet
    const walletNextUnlock: Record<string, { time: number, timeLeft: number }> = {};
    
    const now = Date.now();
    
    balances.forEach(balance => {
      const unlockTime = new Date(balance.unlockTime).getTime();
      const timeLeft = unlockTime - now;
      
      // Already unlocked, no need to schedule
      if (timeLeft <= 0) return;
      
      // Check if this is sooner than previously found unlocks for this wallet
      if (!walletNextUnlock[balance.walletId] || unlockTime < walletNextUnlock[balance.walletId].time) {
        walletNextUnlock[balance.walletId] = { 
          time: unlockTime,
          timeLeft 
        };
      }
    });
    
    // Schedule a check shortly before each unlock time
    Object.entries(walletNextUnlock).forEach(([walletId, { timeLeft }]) => {
      // If it's going to unlock in more than 10 minutes, schedule a check 5 minutes before unlock
      if (timeLeft > 10 * 60 * 1000) {
        const checkTime = timeLeft - 5 * 60 * 1000; // 5 minutes before unlock
        
        addLog({
          message: `Scheduled balance check in ${formatTimeRemaining(checkTime)}`,
          status: 'info',
          walletId
        });
        
        scheduledChecksRef.current[walletId] = setTimeout(() => {
          // Check this specific wallet when the time comes
          fetchBalancesForWallet(wallets.find(w => w.id === walletId));
        }, checkTime);
      } 
      // If it's going to unlock in 1-10 minutes, schedule a check 1 minute before unlock
      else if (timeLeft > 60 * 1000) {
        const checkTime = timeLeft - 60 * 1000; // 1 minute before unlock
        
        addLog({
          message: `Scheduled balance check in ${formatTimeRemaining(checkTime)}`,
          status: 'info', 
          walletId
        });
        
        scheduledChecksRef.current[walletId] = setTimeout(() => {
          // Check this specific wallet when the time comes
          fetchBalancesForWallet(wallets.find(w => w.id === walletId));
        }, checkTime);
      }
      // If it's going to unlock very soon (within 1 minute), schedule a check at 10 seconds before unlock
      else if (timeLeft > 10 * 1000) {
        const checkTime = timeLeft - 10 * 1000; // 10 seconds before unlock
        
        addLog({
          message: `Scheduled balance check in ${formatTimeRemaining(checkTime)}`,
          status: 'info',
          walletId
        });
        
        scheduledChecksRef.current[walletId] = setTimeout(() => {
          // Check this specific wallet when the time comes
          fetchBalancesForWallet(wallets.find(w => w.id === walletId));
        }, checkTime);
      }
      // If it's going to unlock extremely soon, check right away
      else {
        addLog({
          message: `Unlock time approaching, checking now`,
          status: 'info',
          walletId
        });
        
        // Need to wrap in setTimeout to avoid synchronous execution
        scheduledChecksRef.current[walletId] = setTimeout(() => {
          fetchBalancesForWallet(wallets.find(w => w.id === walletId));
        }, 0);
      }
    });
  }, [wallets, addLog]);

  // Format time remaining in a human-readable format
  const formatTimeRemaining = (milliseconds: number): string => {
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

  // Fetch claimable balances for a specific wallet with throttled logging
  const fetchBalancesForWallet = useCallback(async (wallet?: WalletData) => {
    if (!wallet) return;
    
    // Rate limiting per wallet to avoid hammering the API
    const now = Date.now();
    const lastChecked = walletLastCheckedRef.current[wallet.id] || 0;
    const timeSinceLastCheck = now - lastChecked;
    
    // Don't check more often than once every 30 seconds per wallet unless it's the first check
    if (lastChecked > 0 && timeSinceLastCheck < 30000) {
      return; // Skip without logging to reduce console spam
    }
    
    try {
      // Throttled logging to reduce console spam
      throttledLog(`Fetching balances for wallet ${wallet.address.substring(0, 6)}...`);
      
      // Update last checked timestamp for this wallet
      walletLastCheckedRef.current[wallet.id] = now;
      
      const data = await fetchClaimableBalances(wallet.address);
      
      if (data._embedded?.records?.length > 0) {
        const walletBalances = data._embedded.records.map((record: any) => {
          // Use our helper function to extract the correct unlock time
          const unlockTime = extractUnlockTime(record);
          
          return {
            id: record.id,
            amount: record.amount,
            unlockTime,
            walletId: wallet.id
          };
        });
        
        setClaimableBalances(prev => {
          // Filter out old balances for this wallet
          const otherWalletBalances = prev.filter(balance => balance.walletId !== wallet.id);
          
          // Combine with new balances
          const newBalances = [...otherWalletBalances, ...walletBalances];
          
          // Schedule checks based on the new balance list
          scheduleChecksBasedOnUnlockTimes(newBalances);
          
          return newBalances;
        });
        
        setLastUpdate(new Date());
        
        addLog({
          message: `Found ${walletBalances.length} claimable balance(s) for wallet ${wallet.address.substring(0, 6)}...`,
          status: 'info',
          walletId: wallet.id
        });
      } else {
        // No balances found - just update the last checked time
        setClaimableBalances(prev => {
          const filteredBalances = prev.filter(balance => balance.walletId !== wallet.id);
          
          // Re-schedule checks if needed
          if (filteredBalances.length !== prev.length) {
            scheduleChecksBasedOnUnlockTimes(filteredBalances);
          }
          
          return filteredBalances;
        });
      }
    } catch (error) {
      console.error(`Error fetching balances for wallet ${wallet.address}:`, error);
      addLog({
        message: `Failed to fetch balances for wallet ${wallet.address.substring(0, 6)}...`,
        status: 'error',
        walletId: wallet.id
      });
    }
  }, [addLog, scheduleChecksBasedOnUnlockTimes, throttledLog]);

  // Fetch claimable balances for all wallets with improved logging
  const fetchAllBalances = useCallback(async () => {
    if (wallets.length === 0 || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoading(true);
    
    try {
      // Clear existing data - will be replaced with fresh data
      setClaimableBalances([]);
      
      // Throttled logging
      throttledLog(`Fetching balances for ${wallets.length} wallets`);
      
      for (const wallet of wallets) {
        await fetchBalancesForWallet(wallet);
      }
      
      if (wallets.length > 0 && claimableBalances.length === 0) {
        addLog({
          message: 'No claimable balances found for any wallet',
          status: 'info'
        });
      }
    } catch (error) {
      console.error('Error in fetchAllBalances:', error);
      toast.error('Failed to fetch claimable balances');
      addLog({
        message: 'Failed to fetch claimable balances',
        status: 'error'
      });
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [wallets, addLog, claimableBalances.length, fetchBalancesForWallet, throttledLog]);

  // Initial fetch on mount or wallet change - optimized to reduce unnecessary fetches
  useEffect(() => {
    // Only fetch if we have wallets to check and:
    // 1. Either we haven't fetched before
    // 2. Or the wallet count has changed
    const currentWalletCount = wallets.length;
    
    // Check if wallet count changed before logging and fetching
    if (currentWalletCount > 0 && 
        (currentWalletCount !== previousWalletCountRef.current || !initialFetchDoneRef.current)) {
      // Use throttled logging
      throttledLog(`Wallet count changed to ${currentWalletCount}, refreshing balances`);
      fetchAllBalances();
      initialFetchDoneRef.current = true;
    }
    
    // Update previous wallet count for next comparison
    previousWalletCountRef.current = currentWalletCount;
    
    // Refresh balances every 10 minutes as a fallback - DECREASED FREQUENCY to reduce CPU load
    const intervalId = setInterval(() => {
      fetchAllBalances();
    }, 15 * 60 * 1000); // Increased from 10 to 15 minutes to reduce CPU usage
    
    return () => {
      clearInterval(intervalId);
      // Clear any scheduled checks
      Object.values(scheduledChecksRef.current).forEach(timeoutId => clearTimeout(timeoutId));
    };
  }, [wallets, fetchAllBalances, throttledLog]);
  
  // Remove a specific balance (e.g., after claiming)
  const removeBalance = useCallback((balanceId: string) => {
    setClaimableBalances(prev => {
      const newBalances = prev.filter(balance => balance.id !== balanceId);
      
      // Re-schedule checks based on the new balance list (in case this one had a scheduled check)
      scheduleChecksBasedOnUnlockTimes(newBalances);
      
      return newBalances;
    });
  }, [scheduleChecksBasedOnUnlockTimes]);

  return {
    claimableBalances,
    isLoading,
    lastUpdate,
    fetchAllBalances,
    removeBalance
  };
}
