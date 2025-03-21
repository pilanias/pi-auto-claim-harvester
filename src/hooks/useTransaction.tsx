
import { useState, useEffect, useCallback, useRef } from 'react';
import { WalletData, ClaimableBalance, TransactionStatus } from '@/lib/types';
import { fetchSequenceNumber, submitTransaction } from '@/lib/api';
import { toast } from 'sonner';

export function useTransaction(
  wallets: WalletData[],
  claimableBalances: ClaimableBalance[],
  removeBalance: (id: string) => void,
  addLog: Function
) {
  const [processingBalances, setProcessingBalances] = useState<Record<string, TransactionStatus>>({});
  const [activeTimers, setActiveTimers] = useState<Record<string, NodeJS.Timeout>>({});
  const sequenceNumbersRef = useRef<Record<string, string>>({});

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      Object.values(activeTimers).forEach(timer => clearTimeout(timer));
    };
  }, [activeTimers]);

  // Set up timers for each claimable balance
  useEffect(() => {
    // Clear all existing timers when balances change
    Object.values(activeTimers).forEach(timer => clearTimeout(timer));
    setActiveTimers({});
    
    // Set up new timers for each balance
    claimableBalances.forEach(balance => {
      const now = new Date();
      const unlockTime = new Date(balance.unlockTime);
      
      // Skip balances that are already processing or completed
      if (processingBalances[balance.id]) return;
      
      // Calculate time until sequence number fetch (3 seconds before unlock)
      const timeUntilSequenceFetch = unlockTime.getTime() - now.getTime() - 3000;
      
      if (timeUntilSequenceFetch > 0) {
        // Set timer to fetch sequence number 3 seconds before unlock
        const timer = setTimeout(() => {
          startProcessingBalance(balance);
        }, timeUntilSequenceFetch);
        
        setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
        
        addLog({
          message: `Scheduled claim for ${balance.amount} Pi in ${formatTimeRemaining(timeUntilSequenceFetch + 3000)}`,
          status: 'info',
          walletId: balance.walletId
        });
      } else if (unlockTime > now) {
        // Less than 3 seconds until unlock, fetch sequence number immediately
        startProcessingBalance(balance);
      } else {
        // Already unlocked, process immediately
        startProcessingBalance(balance);
        
        addLog({
          message: `Processing already unlocked balance of ${balance.amount} Pi`,
          status: 'info',
          walletId: balance.walletId
        });
      }
    });
  }, [claimableBalances]);

  // Start processing a balance (fetch sequence number, etc.)
  const startProcessingBalance = useCallback(async (balance: ClaimableBalance) => {
    const wallet = wallets.find(w => w.id === balance.walletId);
    if (!wallet) {
      console.error('Wallet not found for balance:', balance);
      return;
    }
    
    // Update status to fetching sequence
    setProcessingBalances(prev => ({ ...prev, [balance.id]: 'fetching_sequence' }));
    
    addLog({
      message: `Fetching sequence number for wallet ${wallet.address.substring(0, 6)}...`,
      status: 'info',
      walletId: wallet.id
    });
    
    try {
      // Fetch sequence number
      const sequenceNumber = await fetchSequenceNumber(wallet.address);
      sequenceNumbersRef.current[balance.id] = sequenceNumber;
      
      addLog({
        message: `Sequence number fetched: ${sequenceNumber}`,
        status: 'success',
        walletId: wallet.id
      });
      
      // Check if we need to wait for unlock time
      const now = new Date();
      const unlockTime = new Date(balance.unlockTime);
      const timeUntilUnlock = unlockTime.getTime() - now.getTime();
      
      if (timeUntilUnlock > 0) {
        // Set status to waiting
        setProcessingBalances(prev => ({ ...prev, [balance.id]: 'waiting' }));
        
        addLog({
          message: `Waiting ${formatTimeRemaining(timeUntilUnlock)} until unlock time`,
          status: 'info',
          walletId: wallet.id
        });
        
        // Set timer to construct transaction 1 second after unlock
        const timer = setTimeout(() => {
          constructAndSubmitTransaction(balance, wallet);
        }, timeUntilUnlock + 1000);
        
        setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
      } else {
        // Already unlocked, construct and submit transaction immediately
        constructAndSubmitTransaction(balance, wallet);
      }
    } catch (error) {
      console.error('Error fetching sequence number:', error);
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'failed' }));
      
      addLog({
        message: `Failed to fetch sequence number: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error',
        walletId: wallet.id
      });
      
      // Retry after a delay
      const timer = setTimeout(() => {
        startProcessingBalance(balance);
      }, 30000);
      
      setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
    }
  }, [wallets, addLog]);

  // Construct and submit transaction
  const constructAndSubmitTransaction = useCallback(async (balance: ClaimableBalance, wallet: WalletData) => {
    // Update status to constructing
    setProcessingBalances(prev => ({ ...prev, [balance.id]: 'constructing' }));
    
    addLog({
      message: `Constructing transaction for ${balance.amount} Pi`,
      status: 'info',
      walletId: wallet.id
    });
    
    try {
      // In a real implementation, you would construct the XDR transaction here
      // using the stellar-sdk library and the sequence number
      const sequenceNumber = sequenceNumbersRef.current[balance.id];
      if (!sequenceNumber) {
        throw new Error('Sequence number not found');
      }
      
      // For simulation, we'll pause briefly to simulate construction
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update status to signing
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'signing' }));
      
      addLog({
        message: 'Signing transaction with private key',
        status: 'info',
        walletId: wallet.id
      });
      
      // In a real implementation, you would sign the transaction with the private key here
      // For simulation, we'll pause briefly to simulate signing
      await new Promise(resolve => setTimeout(resolve, 700));
      
      // Generate a mock signed transaction
      const mockSignedXdr = `AAAAAgAAAACrNiSOfs0l4D1N${Math.random().toString(36).substring(2, 15)}AAAAJ`;
      
      // Update status to submitting
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'submitting' }));
      
      addLog({
        message: 'Submitting transaction to network',
        status: 'info',
        walletId: wallet.id
      });
      
      // Submit the transaction
      const result = await submitTransaction(mockSignedXdr);
      
      // Update status to completed
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'completed' }));
      
      addLog({
        message: `Transaction successful! Hash: ${result.hash.substring(0, 8)}...`,
        status: 'success',
        walletId: wallet.id
      });
      
      toast.success(`Successfully claimed ${balance.amount} Pi`);
      
      // Remove the balance after successful processing
      removeBalance(balance.id);
      
      // Clean up
      delete sequenceNumbersRef.current[balance.id];
      setActiveTimers(prev => {
        const newTimers = { ...prev };
        delete newTimers[balance.id];
        return newTimers;
      });
      
    } catch (error) {
      console.error('Transaction error:', error);
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'failed' }));
      
      addLog({
        message: `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error',
        walletId: wallet.id
      });
      
      toast.error('Transaction failed, will retry in 30 seconds');
      
      // Retry after a delay
      const timer = setTimeout(() => {
        startProcessingBalance(balance);
      }, 30000);
      
      setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
    }
  }, [addLog, removeBalance]);

  // Helper function to format time remaining
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

  return {
    processingBalances,
    formatTimeRemaining
  };
}
