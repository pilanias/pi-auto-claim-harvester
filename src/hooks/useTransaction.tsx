
import { useState, useEffect, useCallback, useRef } from 'react';
import { WalletData, ClaimableBalance, TransactionStatus } from '@/lib/types';
import { fetchSequenceNumber, submitTransaction } from '@/lib/api';
import { toast } from 'sonner';
import * as StellarSdk from 'stellar-sdk';

// Set up Stellar SDK network configuration to use Pi Network
const piNetwork = StellarSdk.Networks.PUBLIC; // Using the public network for Pi
const server = new StellarSdk.Horizon.Server("https://api.mainnet.minepi.com");

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
      // Fetch sequence number - this returns the EXACT sequence from the network
      const sequenceNumber = await fetchSequenceNumber(wallet.address);
      // Store the exact sequence number from the network
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

  // Construct and submit transaction with both claim and payment operations
  const constructAndSubmitTransaction = useCallback(async (balance: ClaimableBalance, wallet: WalletData) => {
    // Update status to constructing
    setProcessingBalances(prev => ({ ...prev, [balance.id]: 'constructing' }));
    
    addLog({
      message: `Constructing transaction for ${balance.amount} Pi`,
      status: 'info',
      walletId: wallet.id
    });
    
    try {
      // Get sequence number from our stored reference
      const sequenceNumber = sequenceNumbersRef.current[balance.id];
      if (!sequenceNumber) {
        throw new Error('Sequence number not found');
      }
      
      // Create source account WITH INCREMENT by 1 here (not in the API)
      // Use BigInt to safely handle large integers and increment by 1
      const incrementedSeq = (BigInt(sequenceNumber) + 1n).toString();
      const source = new StellarSdk.Account(wallet.address, incrementedSeq);
      
      // Log the exact sequence being used
      addLog({
        message: `Using sequence number: ${incrementedSeq} (increment from ${sequenceNumber})`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Build transaction with BOTH claim and payment operations
      let transaction = new StellarSdk.TransactionBuilder(source, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: piNetwork
      })
      .addOperation(
        StellarSdk.Operation.claimClaimableBalance({
          balanceId: balance.id
        })
      )
      .addOperation(
        StellarSdk.Operation.payment({
          destination: wallet.destinationAddress,
          asset: StellarSdk.Asset.native(), // Pi is the native asset
          amount: balance.amount
        })
      )
      // No memo needed
      .setTimeout(0) // Set timeout to 0, which effectively means no timeout
      .build();
      
      // Update status to signing
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'signing' }));
      
      addLog({
        message: 'Signing transaction with private key',
        status: 'info',
        walletId: wallet.id
      });
      
      // Sign transaction with private key
      const keyPair = StellarSdk.Keypair.fromSecret(wallet.privateKey);
      transaction.sign(keyPair);
      
      // Get transaction XDR
      const xdr = transaction.toXDR();
      
      // Update status to submitting
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'submitting' }));
      
      addLog({
        message: 'Submitting transaction to network',
        status: 'info',
        walletId: wallet.id
      });
      
      // Submit the transaction
      const result = await submitTransaction(xdr);
      
      // Check if transaction was successful
      if (result.successful) {
        // Update status to completed
        setProcessingBalances(prev => ({ ...prev, [balance.id]: 'completed' }));
        
        addLog({
          message: `Transaction successful! Hash: ${result.hash.substring(0, 8)}...`,
          status: 'success',
          walletId: wallet.id
        });
        
        toast.success(`Successfully claimed and transferred ${balance.amount} Pi`);
        
        // Remove the balance after successful processing
        removeBalance(balance.id);
      } else {
        throw new Error('Transaction submission was not successful');
      }
      
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
