
import { useState, useEffect, useCallback, useRef } from 'react';
import { ClaimableBalance, WalletData } from '@/lib/types';
import { fetchClaimableBalances } from '@/lib/api';
import { toast } from 'sonner';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useClaimableBalances(wallets: WalletData[], addLog: Function) {
  const [claimableBalances, setClaimableBalances] = useState<ClaimableBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const refreshCountRef = useRef<number>(0);
  const inProgressRef = useRef<Set<string>>(new Set());

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

  // Fetch claimable balances for a single wallet with backoff retry
  const fetchWalletBalances = useCallback(async (
    wallet: WalletData, 
    retryCount = 0,
    maxRetries = 3
  ) => {
    const walletKey = wallet.id;
    
    // Skip if this wallet is already being processed
    if (inProgressRef.current.has(walletKey)) {
      return [];
    }
    
    inProgressRef.current.add(walletKey);
    
    try {
      const data = await fetchClaimableBalances(wallet.address);
      
      if (!isMountedRef.current) return [];
      
      if (data._embedded?.records?.length > 0) {
        const walletBalances = data._embedded.records.map((record: any) => {
          // Use our helper function to extract the correct unlock time
          const unlockTime = extractUnlockTime(record);
          
          return {
            id: record.id,
            amount: record.amount,
            unlockTime,
            walletId: wallet.id,
            lastChecked: new Date()
          };
        });
        
        addLog({
          message: `Found ${walletBalances.length} claimable balance(s) for wallet ${wallet.address.substring(0, 6)}...`,
          status: 'info',
          walletId: wallet.id
        });
        
        return walletBalances;
      }
      
      return [];
    } catch (error) {
      console.error(`Error fetching balances for wallet ${wallet.address}:`, error);
      
      // If we have retries left, try again with exponential backoff
      if (retryCount < maxRetries) {
        const backoffTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s backoff
        
        addLog({
          message: `Retrying balance fetch for wallet ${wallet.address.substring(0, 6)}... (attempt ${retryCount + 1}/${maxRetries + 1})`,
          status: 'warning',
          walletId: wallet.id
        });
        
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return fetchWalletBalances(wallet, retryCount + 1, maxRetries);
      }
      
      addLog({
        message: `Failed to fetch balances for wallet ${wallet.address.substring(0, 6)}...`,
        status: 'error',
        walletId: wallet.id
      });
      return [];
    } finally {
      inProgressRef.current.delete(walletKey);
    }
  }, [addLog, extractUnlockTime]);

  // Fetch claimable balances for all wallets
  const fetchAllBalances = useCallback(async (force = false) => {
    if (wallets.length === 0) {
      setClaimableBalances([]);
      return;
    }

    // If already loading and not forced, skip
    if (isLoading && !force) return;

    setIsLoading(true);
    refreshCountRef.current += 1;
    const currentRefreshCount = refreshCountRef.current;
    
    try {
      let newBalances: ClaimableBalance[] = [];

      // Process wallets in parallel, but with limits
      const results = await Promise.all(
        wallets.map(wallet => fetchWalletBalances(wallet))
      );
      
      // If the component unmounted or a newer fetch was initiated, abort
      if (!isMountedRef.current || currentRefreshCount !== refreshCountRef.current) {
        return;
      }
      
      // Flatten results
      newBalances = results.flat();
      
      // Merge with existing balances to preserve isProcessing flags
      setClaimableBalances(prev => {
        const balanceMap = new Map(
          prev.map(balance => [balance.id, balance])
        );
        
        newBalances.forEach(newBalance => {
          const existing = balanceMap.get(newBalance.id);
          if (existing) {
            // Preserve processing state from existing balance
            newBalance.isProcessing = existing.isProcessing;
          }
          balanceMap.set(newBalance.id, newBalance);
        });
        
        return Array.from(balanceMap.values());
      });
      
      setLastUpdate(new Date());
      
      if (newBalances.length === 0 && wallets.length > 0) {
        addLog({
          message: 'No claimable balances found for any wallet',
          status: 'info'
        });
      }
    } catch (error) {
      console.error('Error in fetchAllBalances:', error);
      
      if (isMountedRef.current) {
        toast.error('Failed to fetch claimable balances');
        addLog({
          message: 'Failed to fetch claimable balances',
          status: 'error'
        });
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [wallets, addLog, fetchWalletBalances, isLoading]);

  // Initial fetch and setup periodic refresh
  useEffect(() => {
    isMountedRef.current = true;
    fetchAllBalances();
    
    // Refresh balances every 5 minutes
    timerRef.current = setInterval(() => {
      fetchAllBalances();
    }, REFRESH_INTERVAL);
    
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchAllBalances]);

  // Schedule pre-unlock data refresh
  useEffect(() => {
    const unlockRefreshTimers: Record<string, NodeJS.Timeout> = {};
    
    // For each balance, set up a timer to refresh 2 seconds before unlock
    claimableBalances.forEach(balance => {
      const now = new Date();
      const unlockTime = new Date(balance.unlockTime);
      const timeUntilUnlock = unlockTime.getTime() - now.getTime();
      
      // If more than 2 seconds until unlock, schedule a pre-unlock refresh
      if (timeUntilUnlock > 2000) {
        const timerId = setTimeout(() => {
          // Refetch just before unlock for most up-to-date data
          const targetWallet = wallets.find(w => w.id === balance.walletId);
          if (targetWallet) {
            fetchWalletBalances(targetWallet);
          }
        }, timeUntilUnlock - 2000);
        
        unlockRefreshTimers[balance.id] = timerId;
      }
    });
    
    return () => {
      // Clean up all timers
      Object.values(unlockRefreshTimers).forEach(timerId => {
        clearTimeout(timerId);
      });
    };
  }, [claimableBalances, wallets, fetchWalletBalances]);

  // Remove balances for wallets that no longer exist
  useEffect(() => {
    setClaimableBalances(prev => 
      prev.filter(balance => wallets.some(wallet => wallet.id === balance.walletId))
    );
  }, [wallets]);
  
  // Remove a specific balance (e.g., after claiming)
  const removeBalance = useCallback((balanceId: string) => {
    setClaimableBalances(prev => prev.filter(balance => balance.id !== balanceId));
  }, []);

  // Mark a balance as processing
  const markBalanceProcessing = useCallback((balanceId: string, isProcessing: boolean) => {
    setClaimableBalances(prev => 
      prev.map(balance => 
        balance.id === balanceId ? { ...balance, isProcessing } : balance
      )
    );
  }, []);

  return {
    claimableBalances,
    isLoading,
    lastUpdate,
    fetchAllBalances,
    removeBalance,
    markBalanceProcessing
  };
}
