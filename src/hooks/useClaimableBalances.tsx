
import { useState, useEffect, useCallback } from 'react';
import { ClaimableBalance, WalletData } from '@/lib/types';
import { fetchClaimableBalances } from '@/lib/api';
import { toast } from 'sonner';

// Longer refresh interval (5 minutes = 300000ms)
const REFRESH_INTERVAL = 5 * 60 * 1000;

export function useClaimableBalances(wallets: WalletData[], addLog: Function) {
  const [claimableBalances, setClaimableBalances] = useState<ClaimableBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshEnabled, setRefreshEnabled] = useState(true);

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
    // Skip if already loading or no wallets
    if ((isLoading && !force) || wallets.length === 0) {
      if (wallets.length === 0) {
        setClaimableBalances([]);
      }
      return;
    }

    // Prevent fetching too frequently unless forced
    if (!force && lastUpdate) {
      const timeSinceLastUpdate = Date.now() - lastUpdate.getTime();
      if (timeSinceLastUpdate < 60000) { // 1 minute minimum between auto-refreshes
        console.log(`Skipping automatic refresh - last update was ${Math.floor(timeSinceLastUpdate/1000)}s ago`);
        return;
      }
    }

    setIsLoading(true);
    let newBalances: ClaimableBalance[] = [];

    try {
      for (const wallet of wallets) {
        try {
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
    }
  }, [wallets, addLog, isLoading, lastUpdate]);

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
    fetchAllBalances();
    
    // Refresh balances every 5 minutes instead of 2 minutes
    const intervalId = setInterval(() => {
      if (refreshEnabled) {
        console.log('Running scheduled balance check (5 minute interval)');
        fetchAllBalances();
      }
    }, REFRESH_INTERVAL);
    
    return () => clearInterval(intervalId);
  }, [fetchAllBalances, refreshEnabled]);

  // Also refresh whenever wallets change
  useEffect(() => {
    fetchAllBalances(true); // Force refresh when wallets change
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
