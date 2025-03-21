
import { useState, useEffect, useCallback } from 'react';
import { ClaimableBalance, WalletData } from '@/lib/types';
import { fetchClaimableBalances } from '@/lib/api';
import { toast } from 'sonner';

export function useClaimableBalances(wallets: WalletData[], addLog: Function) {
  const [claimableBalances, setClaimableBalances] = useState<ClaimableBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch claimable balances for all wallets
  const fetchAllBalances = useCallback(async () => {
    if (wallets.length === 0) {
      setClaimableBalances([]);
      return;
    }

    setIsLoading(true);
    let newBalances: ClaimableBalance[] = [];

    try {
      for (const wallet of wallets) {
        try {
          const data = await fetchClaimableBalances(wallet.address);
          
          if (data._embedded?.records?.length > 0) {
            const walletBalances = data._embedded.records.map((record: any) => {
              // Extract the unlock time from the predicate
              const unlockTime = new Date(record.claimants[0]?.predicate?.abs_before || Date.now());
              
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
  }, [wallets, addLog]);

  // Initial fetch and setup periodic refresh
  useEffect(() => {
    fetchAllBalances();
    
    // Refresh balances every 2 minutes
    const intervalId = setInterval(() => {
      fetchAllBalances();
    }, 2 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, [fetchAllBalances]);

  // Also refresh whenever wallets change
  useEffect(() => {
    fetchAllBalances();
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
    removeBalance
  };
}
