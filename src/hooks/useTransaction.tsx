import { useState, useEffect, useCallback, useRef } from 'react';
import { WalletData, ClaimableBalance, TransactionStatus } from '@/lib/types';
import { fetchSequenceNumber, submitTransaction, NETWORK_PASSPHRASE } from '@/lib/api';
import { toast } from 'sonner';
import * as StellarSdk from '@stellar/stellar-sdk';

// Set up Stellar SDK network configuration to use Pi Network
const server = new StellarSdk.Horizon.Server("https://api.mainnet.minepi.com");

// Time to start preparing transaction before unlock (2 seconds)
const PREP_TIME_BEFORE_UNLOCK = 2000;

// No extra buffer needed - submit right at unlock time
const SUBMIT_BUFFER_AFTER_UNLOCK = 0;

// Retry intervals for failed transactions (in ms)
const RETRY_INTERVALS = [5000, 15000, 30000, 60000];

export function useTransaction(
  wallets: WalletData[],
  claimableBalances: ClaimableBalance[],
  removeBalance: (id: string) => void,
  markBalanceProcessing: (id: string, isProcessing: boolean) => void,
  addLog: Function
) {
  const [processingBalances, setProcessingBalances] = useState<Record<string, TransactionStatus>>({});
  const activeTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const sequenceCacheRef = useRef<Record<string, { sequence: string, timestamp: number }>>({});
  const failedAttemptsRef = useRef<Record<string, number>>({});
  const isMountedRef = useRef<boolean>(true);
  
  // Clean up timers on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      Object.values(activeTimersRef.current).forEach(timer => clearTimeout(timer));
      activeTimersRef.current = {};
    };
  }, []);

  // Get cached sequence for a wallet or fetch a new one
  const getSequenceNumber = useCallback(async (walletAddress: string): Promise<string> => {
    // Check cache first (valid for 30 seconds)
    const cachedData = sequenceCacheRef.current[walletAddress];
    const now = Date.now();
    
    if (cachedData && (now - cachedData.timestamp) < 30000) {
      return cachedData.sequence;
    }
    
    // Fetch fresh sequence
    const sequence = await fetchSequenceNumber(walletAddress);
    
    // Update cache
    sequenceCacheRef.current[walletAddress] = {
      sequence,
      timestamp: now
    };
    
    return sequence;
  }, []);

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

  // Schedule transaction processing for all balances
  useEffect(() => {
    const processableBalances = claimableBalances.filter(balance => {
      const status = processingBalances[balance.id];
      
      // Skip if already being processed
      if (status && status !== 'idle' && status !== 'failed') {
        return false;
      }
      
      // Always process if already unlocked
      if (new Date() >= new Date(balance.unlockTime)) {
        return true;
      }
      
      // Schedule processing before unlock time
      const unlockTime = new Date(balance.unlockTime).getTime();
      const now = Date.now();
      return (unlockTime - now) <= PREP_TIME_BEFORE_UNLOCK;
    });
    
    // Process each balance
    processableBalances.forEach(balance => {
      // Skip if already scheduled
      if (activeTimersRef.current[balance.id]) {
        return;
      }
      
      const wallet = wallets.find(w => w.id === balance.walletId);
      if (!wallet) return;
      
      const unlockTime = new Date(balance.unlockTime).getTime();
      const now = Date.now();
      const timeUntilUnlock = Math.max(0, unlockTime - now);
      
      // If already unlocked or within preparation window, start processing
      if (timeUntilUnlock <= PREP_TIME_BEFORE_UNLOCK) {
        startProcessingBalance(balance);
      } else {
        // Schedule processing to start at the right time
        const timerId = setTimeout(() => {
          startProcessingBalance(balance);
        }, timeUntilUnlock - PREP_TIME_BEFORE_UNLOCK);
        
        activeTimersRef.current[balance.id] = timerId;
        
        addLog({
          message: `Scheduled processing for ${balance.amount} Pi in ${formatTimeRemaining(timeUntilUnlock)}`,
          status: 'info',
          walletId: wallet.id
        });
      }
    });
    
    // Cleanup function
    return () => {
      // Clear any timers that exist for balances not in the current list
      const currentBalanceIds = new Set(claimableBalances.map(b => b.id));
      
      Object.entries(activeTimersRef.current).forEach(([balanceId, timerId]) => {
        if (!currentBalanceIds.has(balanceId)) {
          clearTimeout(timerId);
          delete activeTimersRef.current[balanceId];
        }
      });
    };
  }, [claimableBalances, wallets, processingBalances, addLog]);

  // Start processing a balance
  const startProcessingBalance = useCallback(async (balance: ClaimableBalance) => {
    const wallet = wallets.find(w => w.id === balance.walletId);
    if (!wallet) {
      console.error('Wallet not found for balance:', balance);
      return;
    }
    
    // Clear any existing timers for this balance
    if (activeTimersRef.current[balance.id]) {
      clearTimeout(activeTimersRef.current[balance.id]);
      delete activeTimersRef.current[balance.id];
    }
    
    // Update status to fetching sequence
    updateBalanceStatus(balance.id, 'fetching_sequence');
    markBalanceProcessing(balance.id, true);
    
    addLog({
      message: `Fetching sequence number for wallet ${wallet.address.substring(0, 6)}...`,
      status: 'info',
      walletId: wallet.id
    });
    
    try {
      // Fetch sequence number directly from the API
      const currentSequence = await getSequenceNumber(wallet.address);
      
      if (!isMountedRef.current) return;
      
      addLog({
        message: `Current sequence from API: ${currentSequence}`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Check if we need to wait for unlock time
      const now = Date.now();
      const unlockTime = new Date(balance.unlockTime).getTime();
      const timeUntilUnlock = unlockTime - now;
      
      if (timeUntilUnlock > 0) {
        // Set status to waiting
        updateBalanceStatus(balance.id, 'waiting');
        
        addLog({
          message: `Waiting ${formatTimeRemaining(timeUntilUnlock)} until unlock time`,
          status: 'info',
          walletId: wallet.id
        });
        
        // Set timer to construct transaction at unlock time with minimal buffer
        const timer = setTimeout(() => {
          constructAndSubmitTransaction(balance, wallet, currentSequence);
        }, timeUntilUnlock + SUBMIT_BUFFER_AFTER_UNLOCK);
        
        activeTimersRef.current[balance.id] = timer;
      } else {
        // Already unlocked, construct and submit transaction immediately
        constructAndSubmitTransaction(balance, wallet, currentSequence);
      }
    } catch (error) {
      console.error('Error fetching sequence number:', error);
      updateBalanceStatus(balance.id, 'failed');
      
      addLog({
        message: `Failed to fetch sequence number: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error',
        walletId: wallet.id
      });
      
      // Try again after a delay using exponential backoff
      const attemptCount = (failedAttemptsRef.current[balance.id] || 0) + 1;
      failedAttemptsRef.current[balance.id] = attemptCount;
      
      const delayIndex = Math.min(attemptCount - 1, RETRY_INTERVALS.length - 1);
      const retryDelay = RETRY_INTERVALS[delayIndex];
      
      const timer = setTimeout(() => {
        startProcessingBalance(balance);
      }, retryDelay);
      
      activeTimersRef.current[balance.id] = timer;
      
      addLog({
        message: `Will retry in ${formatTimeRemaining(retryDelay)}`,
        status: 'info',
        walletId: wallet.id
      });
    }
  }, [wallets, addLog, getSequenceNumber, markBalanceProcessing]);

  // Construct and submit transaction with both claim and payment operations
  const constructAndSubmitTransaction = useCallback(async (
    balance: ClaimableBalance, 
    wallet: WalletData, 
    currentSequence: string
  ) => {
    updateBalanceStatus(balance.id, 'constructing');
    
    addLog({
      message: `Constructing transaction for ${balance.amount} Pi`,
      status: 'info',
      walletId: wallet.id
    });
    
    try {
      // Validate the private key first
      if (!wallet.privateKey) {
        throw new Error('Private key is required');
      }
      
      // Clean private key (trim whitespace)
      const cleanPrivateKey = wallet.privateKey.trim();
      
      // Create keypair from private key with additional verification
      let keyPair;
      try {
        keyPair = StellarSdk.Keypair.fromSecret(cleanPrivateKey);
        
        // Validate that keypair matches the wallet address
        if (keyPair.publicKey() !== wallet.address) {
          addLog({
            message: `ERROR: Private key generates address ${keyPair.publicKey()} but wallet address is ${wallet.address}`,
            status: 'error',
            walletId: wallet.id
          });
          throw new Error('Private key does not match wallet address');
        }
      } catch (err) {
        console.error('Error creating keypair:', err);
        throw new Error(`Invalid private key: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
      
      // Convert the sequence to the correct format expected by StellarSdk
      const sequenceAsString = currentSequence.toString();
      
      // Create the source account with the proper sequence format
      const sourceAccount = new StellarSdk.Account(wallet.address, sequenceAsString);
      
      // Transaction with high fee for priority processing
      let transactionBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: "1000000", // 0.1 Pi fee to ensure transaction priority
        networkPassphrase: NETWORK_PASSPHRASE
      });
      
      // Add the claim operation first
      transactionBuilder = transactionBuilder.addOperation(
        StellarSdk.Operation.claimClaimableBalance({
          balanceId: balance.id
        })
      );
      
      // Then add the payment operation to transfer the funds
      transactionBuilder = transactionBuilder.addOperation(
        StellarSdk.Operation.payment({
          destination: wallet.destinationAddress,
          asset: StellarSdk.Asset.native(),
          amount: balance.amount
        })
      );
      
      // Set a reasonable timeout
      transactionBuilder = transactionBuilder.setTimeout(120); // 2 minutes
      
      // Build the transaction
      const transaction = transactionBuilder.build();
      
      // Sign the transaction
      updateBalanceStatus(balance.id, 'signing');
      
      addLog({
        message: `Signing transaction with key for ${wallet.address.substring(0, 6)}...`,
        status: 'info',
        walletId: wallet.id
      });
      
      transaction.sign(keyPair);
      
      // Get the signed XDR
      const xdr = transaction.toXDR();
      
      // Submit the transaction
      updateBalanceStatus(balance.id, 'submitting');
      
      addLog({
        message: `Submitting transaction to network...`,
        status: 'info',
        walletId: wallet.id
      });
      
      const result = await submitTransaction(xdr);
      
      // Check if transaction was successful
      if (result.successful) {
        // Update status to completed
        updateBalanceStatus(balance.id, 'completed');
        
        addLog({
          message: `Transaction successful! Hash: ${result.hash}`,
          status: 'success',
          walletId: wallet.id
        });
        
        toast.success(`Successfully claimed and transferred ${balance.amount} Pi`);
        
        // Reset failed attempts
        delete failedAttemptsRef.current[balance.id];
        
        // Remove the balance after successful processing
        setTimeout(() => {
          removeBalance(balance.id);
        }, 5000); // Show completed status for 5 seconds before removing
      } else {
        // If we have error codes, log them in detail
        if (result.extras && result.extras.result_codes) {
          const errorCodes = JSON.stringify(result.extras.result_codes);
          addLog({
            message: `Error codes: ${errorCodes}`,
            status: 'error',
            walletId: wallet.id
          });
          
          throw new Error(`Transaction failed with codes: ${errorCodes}`);
        } else {
          throw new Error('Transaction submission was not successful');
        }
      }
      
      // Clean up active timers for this balance
      if (activeTimersRef.current[balance.id]) {
        clearTimeout(activeTimersRef.current[balance.id]);
        delete activeTimersRef.current[balance.id];
      }
      
    } catch (error) {
      console.error('Transaction error:', error);
      updateBalanceStatus(balance.id, 'failed');
      
      addLog({
        message: `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error',
        walletId: wallet.id
      });
      
      // Increment failed attempts for this balance
      const attemptCount = (failedAttemptsRef.current[balance.id] || 0) + 1;
      failedAttemptsRef.current[balance.id] = attemptCount;
      
      // Additional handling for specific error types
      if (error instanceof Error) {
        const errorMessage = error.message;
        
        // If it's a sequence number issue, fetch a new sequence and retry sooner
        if (errorMessage.includes('tx_bad_seq') || errorMessage.includes('sequence')) {
          addLog({
            message: 'Sequence number issue detected, retrying with fresh sequence...',
            status: 'info', 
            walletId: wallet.id
          });
          
          // Clear the sequence cache for this wallet
          delete sequenceCacheRef.current[wallet.address];
          
          // Start over with a fresh sequence number after a short delay
          const timer = setTimeout(() => {
            startProcessingBalance(balance);
          }, 5000);
          
          activeTimersRef.current[balance.id] = timer;
          return;
        }
      }
      
      // Use exponential backoff for retries
      const delayIndex = Math.min(attemptCount - 1, RETRY_INTERVALS.length - 1);
      const retryDelay = RETRY_INTERVALS[delayIndex];
      
      toast.error(`Transaction failed, will retry in ${formatTimeRemaining(retryDelay)}`);
      
      const timer = setTimeout(() => {
        startProcessingBalance(balance);
      }, retryDelay);
      
      activeTimersRef.current[balance.id] = timer;
    }
  }, [addLog, removeBalance, markBalanceProcessing]);

  // Update the status of a balance
  const updateBalanceStatus = useCallback((balanceId: string, status: TransactionStatus) => {
    if (!isMountedRef.current) return;
    
    setProcessingBalances(prev => ({
      ...prev,
      [balanceId]: status
    }));
  }, []);

  // Process a specific balance immediately (for manual triggering)
  const processBalanceNow = useCallback((balance: ClaimableBalance) => {
    // If already processing, don't restart
    const currentStatus = processingBalances[balance.id];
    if (currentStatus && currentStatus !== 'idle' && currentStatus !== 'failed') {
      return;
    }
    
    const wallet = wallets.find(w => w.id === balance.walletId);
    if (!wallet) return;
    
    addLog({
      message: `Manually processing balance of ${balance.amount} Pi`,
      status: 'info',
      walletId: wallet.id
    });
    
    startProcessingBalance(balance);
  }, [processingBalances, wallets, addLog, startProcessingBalance]);

  return {
    processingBalances,
    processBalanceNow,
    formatTimeRemaining
  };
}
