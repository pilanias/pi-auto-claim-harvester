
import { useState, useEffect, useCallback, useRef } from 'react';
import { ClaimableBalance, WalletData } from '@/lib/types';
import { fetchClaimableBalances } from '@/lib/api';
import { toast } from 'sonner';

// Longer refresh interval (5 minutes = 300000ms)
const REFRESH_INTERVAL = 5 * 60 * 1000;
// Minimum time between wallet changes and refreshes (30 seconds)
const MIN_REFRESH_INTERVAL = 30 * 1000;

export function useClaimableBalances(wallets: WalletData[], addLog: Function) {
  const [claimableBalances, setClaimableBalances] = useState<ClaimableBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshEnabled, setRefreshEnabled] = useState(true);
  
  // Add refs to track if fetch is in progress to prevent concurrent requests
  const isFetching = useRef(false);
  const lastFetchTime = useRef<number>(0);
  const walletsRef = useRef<WalletData[]>(wallets);
  
  // Update the wallets ref when the wallets array changes
  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);

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

  // Fetch claimable balances for all wallets
  const fetchAllBalances = useCallback(async (force = false) => {
    // Skip if already loading, already fetching, or no wallets
    if ((isLoading && !force) || isFetching.current || wallets.length === 0) {
      if (wallets.length === 0) {
        setClaimableBalances([]);
      }
      return;
    }

    // Enforce minimum time between refreshes to prevent hammering
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTime.current;
    
    if (!force && timeSinceLastFetch < MIN_REFRESH_INTERVAL) {
      console.log(`Skipping refresh - too soon (${Math.floor(timeSinceLastFetch/1000)}s since last fetch, minimum ${MIN_REFRESH_INTERVAL/1000}s)`);
      return;
    }
    
    // Set fetching flag and update last fetch time
    isFetching.current = true;
    lastFetchTime.current = now;
    setIsLoading(true);
    
    let newBalances: ClaimableBalance[] = [];

    try {
      for (const wallet of wallets) {
        try {
          console.log(`Fetching balances for wallet ${wallet.address.substring(0, 6)}...`);
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
            
            newBalances = [...newBalances, ...walletBalances];
            
            addLog({
              message: `Found ${walletBalances.length} claimable balance(s) for wallet ${wallet.address.substring(0, 6)}...`,
              status: 'info',
              walletId: wallet.id
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
      }

      setClaimableBalances(newBalances);
      setLastUpdate(new Date());
      
      if (newBalances.length === 0 && wallets.length > 0) {
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
      // Reset fetching flag with a delay to prevent immediate refetching
      setTimeout(() => {
        isFetching.current = false;
      }, 1000);
    }
  }, [wallets, addLog, isLoading]);

  // Toggle auto-refresh on/off
  const toggleAutoRefresh = useCallback(() => {
    setRefreshEnabled(prev => !prev);
    addLog({
      message: refreshEnabled ? 'Auto-refresh disabled' : 'Auto-refresh enabled',
      status: 'info'
    });
  }, [refreshEnabled, addLog]);

  // Initial fetch and setup periodic refresh with longer interval
  useEffect(() => {
    // Initial fetch - with a small delay to avoid race conditions
    const initialFetchTimer = setTimeout(() => {
      if (!isFetching.current && wallets.length > 0) {
        console.log('Initial balance fetch');
        fetchAllBalances();
      }
    }, 2000); 
    
    // Refresh balances every 5 minutes
    const intervalId = setInterval(() => {
      if (refreshEnabled && !isFetching.current && wallets.length > 0) {
        console.log('Running scheduled balance check (5 minute interval)');
        fetchAllBalances();
      }
    }, REFRESH_INTERVAL);
    
    return () => {
      clearTimeout(initialFetchTimer);
      clearInterval(intervalId);
    };
  }, [fetchAllBalances, refreshEnabled, wallets.length]);

  // Refresh when wallets change - but with additional safeguards
  useEffect(() => {
    const walletsChanged = wallets.length !== walletsRef.current.length;
    
    // Only fetch if wallets changed, we're not already fetching, and enough time has passed
    if (walletsChanged && !isFetching.current && wallets.length > 0) {
      const timeSinceLastFetch = Date.now() - lastFetchTime.current;
      
      if (timeSinceLastFetch >= MIN_REFRESH_INTERVAL) {
        console.log(`Wallet count changed to ${wallets.length}, refreshing balances`);
        fetchAllBalances(true); // Force refresh when wallets change
      } else {
        console.log(`Wallet count changed to ${wallets.length}, but delaying refresh (last fetch was ${Math.floor(timeSinceLastFetch/1000)}s ago)`);
        // Schedule a delayed refresh
        setTimeout(() => {
          if (!isFetching.current) {
            console.log('Running delayed refresh after wallet change');
            fetchAllBalances(true);
          }
        }, MIN_REFRESH_INTERVAL - timeSinceLastFetch);
      }
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
    setClaimableBalances(prev => prev.filter(balance => balance.id !== balanceId));
  }, []);

  return {
    claimableBalances,
    isLoading,
    lastUpdate,
    fetchAllBalances,
    removeBalance,
    toggleAutoRefresh,
    refreshEnabled
  };
}
