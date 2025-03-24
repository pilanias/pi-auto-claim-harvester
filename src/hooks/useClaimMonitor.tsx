
import { useState, useEffect, useCallback, useRef } from 'react';
import { ClaimableBalance, WalletData, TransactionStatus, LogEntry } from '@/lib/types';
import { fetchClaimableBalances } from '@/lib/api';
import { toast } from 'sonner';
import { useCountdown, getTimeRemaining, syncNetworkTime, withExponentialBackoff } from '@/lib/timeUtils';

// Cache for claim balances to avoid unnecessary API calls
interface ClaimCache {
  lastFetch: number;
  data: ClaimableBalance[];
  byWallet: Record<string, ClaimableBalance[]>;
}

export function useClaimMonitor(
  wallets: WalletData[],
  processingStatuses: Record<string, TransactionStatus>,
  addLog: (logData: Omit<LogEntry, 'id' | 'timestamp'>) => LogEntry
) {
  const [claimableBalances, setClaimableBalances] = useState<ClaimableBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Use refs for values that don't trigger UI updates
  const claimCacheRef = useRef<ClaimCache>({
    lastFetch: 0,
    data: [],
    byWallet: {}
  });
  const fetchTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const syncingRef = useRef<boolean>(false);
  const networkTimeSyncedRef = useRef<boolean>(false);
  
  // Track fetch attempts for exponential backoff
  const fetchAttemptsRef = useRef<Record<string, number>>({});
  
  // Helper function to extract the correct unlock time from predicate
  const extractUnlockTime = useCallback((record: any): Date => {
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
      if (record.claimants.length > 1 && record.claimants[1].predicate?.not?.abs_before) {
        return new Date(record.claimants[1].predicate.not.abs_before);
      }
      
      // Default fallback if we can't determine
      return new Date(Date.now() + 1000 * 60 * 60 * 24); // Default to 24 hours from now
    } catch (error) {
      console.error("Error extracting unlock time:", error);
      return new Date(Date.now() + 1000 * 60 * 60 * 24); // Default to 24 hours from now on error
    }
  }, []);

  // Schedule fetches before predicted unlock time
  const schedulePreUnlockFetch = useCallback((balance: ClaimableBalance) => {
    // Clear any existing timeout for this balance
    if (fetchTimeoutsRef.current[balance.id]) {
      clearTimeout(fetchTimeoutsRef.current[balance.id]);
    }
    
    const timeRemaining = getTimeRemaining(balance.unlockTime);
    
    // If already unlocked or less than 2 seconds away, don't schedule
    if (timeRemaining <= 2000) {
      return;
    }
    
    // Schedule to fetch 2 seconds before unlock
    const fetchDelay = timeRemaining - 2000;
    
    addLog({
      message: `Scheduled pre-unlock fetch in ${(fetchDelay / 1000).toFixed(1)}s for ${balance.amount} Pi`,
      status: 'info',
      walletId: balance.walletId
    });
    
    fetchTimeoutsRef.current[balance.id] = setTimeout(() => {
      const wallet = wallets.find(w => w.id === balance.walletId);
      if (wallet) {
        // Only fetch if not already processing
        if (!processingStatuses[balance.id] || processingStatuses[balance.id] === 'failed') {
          fetchWalletBalances(wallet, true);
        }
      }
    }, fetchDelay);
  }, [wallets, processingStatuses, addLog]);

  // Parse and process claim balance data
  const processClaimData = useCallback((wallet: WalletData, data: any): ClaimableBalance[] => {
    if (!data._embedded?.records) {
      return [];
    }
    
    const balances = data._embedded.records.map((record: any) => {
      const unlockTime = extractUnlockTime(record);
      return {
        id: record.id,
        amount: record.amount,
        unlockTime,
        walletId: wallet.id
      };
    });
    
    if (balances.length > 0) {
      addLog({
        message: `Found ${balances.length} claimable balance(s) for wallet ${wallet.address.substring(0, 6)}...`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Schedule pre-unlock fetches for each balance
      balances.forEach(balance => {
        schedulePreUnlockFetch(balance);
      });
    }
    
    return balances;
  }, [extractUnlockTime, addLog, schedulePreUnlockFetch]);

  // Fetch balances for a specific wallet
  const fetchWalletBalances = useCallback(async (wallet: WalletData, force = false) => {
    try {
      // Skip if we're already loading data and this isn't a forced refresh
      if (syncingRef.current && !force) {
        return;
      }
      
      const cacheTime = 4 * 60 * 1000; // 4 minutes cache time
      const now = Date.now();
      const cached = claimCacheRef.current.byWallet[wallet.id];
      const cacheAge = cached ? now - claimCacheRef.current.lastFetch : Infinity;
      
      // Use cache if available and not forced
      if (!force && cached && cacheAge < cacheTime) {
        console.log(`Using cached claim data for wallet ${wallet.id}, age: ${cacheAge / 1000}s`);
        return cached;
      }
      
      // Use exponential backoff for retries
      const fetchAttempts = fetchAttemptsRef.current[wallet.id] || 0;
      fetchAttemptsRef.current[wallet.id] = fetchAttempts + 1;
      
      const data = await withExponentialBackoff(
        () => fetchClaimableBalances(wallet.address),
        5, // max retries
        1000 * Math.min(fetchAttempts + 1, 5) // base delay increases with prior failures
      );
      
      // Reset fetch attempts on success
      fetchAttemptsRef.current[wallet.id] = 0;
      
      // Process the data
      const balances = processClaimData(wallet, data);
      
      // Update cache
      claimCacheRef.current.byWallet[wallet.id] = balances;
      
      return balances;
    } catch (error) {
      console.error(`Error fetching balances for wallet ${wallet.address}:`, error);
      addLog({
        message: `Failed to fetch balances for wallet ${wallet.address.substring(0, 6)}...`,
        status: 'error',
        walletId: wallet.id
      });
      return [];
    }
  }, [processClaimData, addLog]);

  // Fetch balances for all wallets
  const fetchAllBalances = useCallback(async (force = false) => {
    if (wallets.length === 0) {
      setClaimableBalances([]);
      return;
    }

    if (syncingRef.current && !force) {
      console.log("Skipping fetch as another fetch is in progress");
      return;
    }

    syncingRef.current = true;
    setIsLoading(true);

    try {
      // Sync network time if needed
      if (!networkTimeSyncedRef.current) {
        await syncNetworkTime();
        networkTimeSyncedRef.current = true;
      }
      
      let allBalances: ClaimableBalance[] = [];
      
      // Fetch balances for each wallet, but sequentially to avoid overwhelming the API
      for (const wallet of wallets) {
        const walletBalances = await fetchWalletBalances(wallet, force);
        if (walletBalances && walletBalances.length > 0) {
          allBalances = [...allBalances, ...walletBalances];
        }
      }
      
      // Update state and cache
      setClaimableBalances(allBalances);
      claimCacheRef.current = {
        lastFetch: Date.now(),
        data: allBalances,
        byWallet: wallets.reduce((acc, wallet) => {
          acc[wallet.id] = allBalances.filter(b => b.walletId === wallet.id);
          return acc;
        }, {} as Record<string, ClaimableBalance[]>)
      };
      
      setLastUpdate(new Date());
      
      if (allBalances.length === 0 && wallets.length > 0) {
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
      syncingRef.current = false;
    }
  }, [wallets, addLog, fetchWalletBalances]);

  // Setup periodic refresh
  useEffect(() => {
    // Initial fetch
    fetchAllBalances();
    
    // Set up intervals for different types of fetches
    const regularInterval = setInterval(() => {
      fetchAllBalances();
    }, 5 * 60 * 1000); // 5 minutes
    
    // Sync network time periodically
    const timeSync = setInterval(() => {
      syncNetworkTime();
    }, 30 * 60 * 1000); // 30 minutes
    
    return () => {
      clearInterval(regularInterval);
      clearInterval(timeSync);
      
      // Clear all scheduled fetches
      Object.values(fetchTimeoutsRef.current).forEach(timeout => {
        clearTimeout(timeout);
      });
    };
  }, [fetchAllBalances]);

  // Also refresh whenever wallets change
  useEffect(() => {
    if (wallets.length > 0) {
      fetchAllBalances();
    }
  }, [wallets.length, fetchAllBalances]);

  // Remove balances for wallets that no longer exist
  useEffect(() => {
    setClaimableBalances(prev => 
      prev.filter(balance => wallets.some(wallet => wallet.id === balance.walletId))
    );
  }, [wallets]);
  
  // Remove a specific balance (e.g., after claiming)
  const removeBalance = useCallback((balanceId: string) => {
    // Clear any scheduled fetches for this balance
    if (fetchTimeoutsRef.current[balanceId]) {
      clearTimeout(fetchTimeoutsRef.current[balanceId]);
      delete fetchTimeoutsRef.current[balanceId];
    }
    
    setClaimableBalances(prev => prev.filter(balance => balance.id !== balanceId));
    
    // Also remove from cache
    if (claimCacheRef.current.data) {
      claimCacheRef.current.data = claimCacheRef.current.data.filter(b => b.id !== balanceId);
      
      // Update wallet-specific caches
      for (const walletId in claimCacheRef.current.byWallet) {
        claimCacheRef.current.byWallet[walletId] = claimCacheRef.current.byWallet[walletId].filter(
          b => b.id !== balanceId
        );
      }
    }
  }, []);
  
  // Function to check if a balance is near unlock
  const isNearUnlock = useCallback((balance: ClaimableBalance): boolean => {
    const timeRemaining = getTimeRemaining(balance.unlockTime);
    return timeRemaining > 0 && timeRemaining < 60000; // Within 1 minute
  }, []);
  
  // Function to check if a balance is unlocked
  const isUnlocked = useCallback((balance: ClaimableBalance): boolean => {
    const timeRemaining = getTimeRemaining(balance.unlockTime);
    return timeRemaining <= 0;
  }, []);

  return {
    claimableBalances,
    isLoading,
    lastUpdate,
    fetchAllBalances,
    removeBalance,
    isNearUnlock,
    isUnlocked
  };
}
