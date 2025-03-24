
import { useState, useCallback, useRef, useEffect } from 'react';
import { WalletData, ClaimableBalance, TransactionStatus, LogEntry } from '@/lib/types';
import { fetchSequenceNumber, submitTransaction, NETWORK_PASSPHRASE } from '@/lib/api';
import { toast } from 'sonner';
import * as StellarSdk from '@stellar/stellar-sdk';
import { getTimeRemaining, useCountdown, withExponentialBackoff } from '@/lib/timeUtils';

// Calculate optimal transaction timing
const TRANSACTION_PREPARATION_TIME = 2000; // 2 seconds before unlock
const TRANSACTION_SUBMISSION_DELAY = 1000; // 1 second after unlock

export function useOptimizedTransaction(
  wallets: WalletData[],
  claimableBalances: ClaimableBalance[],
  removeBalance: (id: string) => void,
  addLog: (logData: Omit<LogEntry, 'id' | 'timestamp'>) => LogEntry,
  isUnlocked: (balance: ClaimableBalance) => boolean,
  isNearUnlock: (balance: ClaimableBalance) => boolean
) {
  const [processingBalances, setProcessingBalances] = useState<Record<string, TransactionStatus>>({});
  
  // Use refs for values that don't need to trigger UI updates
  const preparedTransactionsRef = useRef<Record<string, {
    transaction: StellarSdk.Transaction;
    sequence: string;
    keyPair: StellarSdk.Keypair;
  }>>({});
  const timerRefsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const claimingRef = useRef<Set<string>>(new Set());
  
  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timerRefsRef.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Initialize processing for balances that are about to unlock
  useEffect(() => {
    // Clear timers for balances that no longer exist
    for (const balanceId in timerRefsRef.current) {
      if (!claimableBalances.some(b => b.id === balanceId)) {
        clearTimeout(timerRefsRef.current[balanceId]);
        delete timerRefsRef.current[balanceId];
        claimingRef.current.delete(balanceId);
        
        // Also clean up prepared transactions
        delete preparedTransactionsRef.current[balanceId];
      }
    }
    
    // Check all balances and prepare for ones that are about to unlock
    claimableBalances.forEach(balance => {
      // Skip if already processing
      if (claimingRef.current.has(balance.id)) {
        return;
      }
      
      const timeRemaining = getTimeRemaining(balance.unlockTime);
      
      // If already unlocked, start processing immediately
      if (timeRemaining <= 0) {
        startProcessingBalance(balance);
        return;
      }
      
      // If unlocking soon, schedule preparation
      if (timeRemaining <= TRANSACTION_PREPARATION_TIME + 5000) { // 5 seconds buffer
        const prepTime = Math.max(0, timeRemaining - TRANSACTION_PREPARATION_TIME);
        
        addLog({
          message: `Will prepare transaction in ${(prepTime / 1000).toFixed(1)}s for ${balance.amount} Pi`,
          status: 'info',
          walletId: balance.walletId
        });
        
        timerRefsRef.current[balance.id] = setTimeout(() => {
          startProcessingBalance(balance);
        }, prepTime);
      }
    });
  }, [claimableBalances, addLog]);

  // Start processing a balance for claiming
  const startProcessingBalance = useCallback(async (balance: ClaimableBalance) => {
    // Skip if already claiming
    if (claimingRef.current.has(balance.id)) {
      return;
    }
    
    const wallet = wallets.find(w => w.id === balance.walletId);
    if (!wallet) {
      console.error('Wallet not found for balance:', balance);
      return;
    }
    
    claimingRef.current.add(balance.id);
    
    // Update status to preparing
    setProcessingBalances(prev => ({ ...prev, [balance.id]: 'fetching_sequence' }));
    
    addLog({
      message: `Preparing to claim ${balance.amount} Pi`,
      status: 'info',
      walletId: wallet.id
    });
    
    try {
      // Fetch sequence number with exponential backoff
      const fetchSequenceWithRetry = async () => {
        setProcessingBalances(prev => ({ ...prev, [balance.id]: 'fetching_sequence' }));
        
        addLog({
          message: `Fetching sequence number for wallet ${wallet.address.substring(0, 6)}...`,
          status: 'info',
          walletId: wallet.id
        });
        
        return await withExponentialBackoff(() => fetchSequenceNumber(wallet.address));
      };
      
      const currentSequence = await fetchSequenceWithRetry();
      
      addLog({
        message: `Current sequence from API: ${currentSequence}`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Check if we need to wait for unlock time
      const timeRemaining = getTimeRemaining(balance.unlockTime);
      
      // Prepare the transaction
      const prepareTransaction = async () => {
        setProcessingBalances(prev => ({ ...prev, [balance.id]: 'constructing' }));
        
        addLog({
          message: `Constructing transaction for ${balance.amount} Pi`,
          status: 'info',
          walletId: wallet.id
        });
        
        // Validate the private key
        if (!wallet.privateKey) {
          throw new Error('Private key is required');
        }
        
        // Clean private key (trim whitespace)
        const cleanPrivateKey = wallet.privateKey.trim();
        
        // Create keypair from private key - with additional verification
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
          
          addLog({
            message: `✓ Private key verification successful`,
            status: 'success',
            walletId: wallet.id
          });
        } catch (err) {
          console.error('Error creating keypair:', err);
          throw new Error(`Invalid private key: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        
        // IMPORTANT: Convert the sequence to the correct format expected by StellarSdk
        const sequenceAsString = currentSequence.toString();
        
        // Create the source account with the proper sequence format
        const sourceAccount = new StellarSdk.Account(wallet.address, sequenceAsString);
        
        // Create transaction builder with higher fee for priority
        let transactionBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: "1000000", // 0.1 Pi fee for priority
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
        
        // Store the prepared transaction and keypair for later submission
        preparedTransactionsRef.current[balance.id] = {
          transaction,
          sequence: sequenceAsString,
          keyPair
        };
        
        addLog({
          message: `Transaction prepared, waiting for unlock time`,
          status: 'info',
          walletId: wallet.id
        });
        
        return { transaction, keyPair };
      };
      
      // Execute preparation based on timing
      if (timeRemaining > TRANSACTION_PREPARATION_TIME) {
        // Wait until it's time to prepare (TRANSACTION_PREPARATION_TIME before unlock)
        setProcessingBalances(prev => ({ ...prev, [balance.id]: 'waiting' }));
        
        addLog({
          message: `Will prepare transaction ${(TRANSACTION_PREPARATION_TIME / 1000).toFixed(0)}s before unlock`,
          status: 'info',
          walletId: wallet.id
        });
        
        const prepDelay = timeRemaining - TRANSACTION_PREPARATION_TIME;
        timerRefsRef.current[balance.id] = setTimeout(() => {
          prepareTransaction().then(({ transaction, keyPair }) => {
            // Schedule submission at optimal time (TRANSACTION_SUBMISSION_DELAY after unlock)
            const submitDelay = TRANSACTION_PREPARATION_TIME + TRANSACTION_SUBMISSION_DELAY;
            
            setProcessingBalances(prev => ({ ...prev, [balance.id]: 'waiting' }));
            
            addLog({
              message: `Will submit transaction ${(TRANSACTION_SUBMISSION_DELAY / 1000).toFixed(0)}s after unlock`,
              status: 'info',
              walletId: wallet.id
            });
            
            timerRefsRef.current[balance.id] = setTimeout(() => {
              submitPreparedTransaction(balance, wallet, transaction, keyPair);
            }, submitDelay);
          }).catch(error => {
            handleProcessingError(balance, wallet, error);
          });
        }, prepDelay);
      } else if (timeRemaining > 0) {
        // Close to unlock time, prepare now and submit at optimal time
        const { transaction, keyPair } = await prepareTransaction();
        
        setProcessingBalances(prev => ({ ...prev, [balance.id]: 'waiting' }));
        
        // Schedule submission at optimal time
        const submitDelay = timeRemaining + TRANSACTION_SUBMISSION_DELAY;
        timerRefsRef.current[balance.id] = setTimeout(() => {
          submitPreparedTransaction(balance, wallet, transaction, keyPair);
        }, submitDelay);
      } else {
        // Already unlocked, prepare and submit immediately
        const { transaction, keyPair } = await prepareTransaction();
        submitPreparedTransaction(balance, wallet, transaction, keyPair);
      }
    } catch (error) {
      handleProcessingError(balance, wallet, error);
    }
  }, [wallets, addLog]);

  // Submit a prepared transaction
  const submitPreparedTransaction = useCallback(async (
    balance: ClaimableBalance,
    wallet: WalletData,
    transaction: StellarSdk.Transaction,
    keyPair: StellarSdk.Keypair
  ) => {
    try {
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'signing' }));
      
      addLog({
        message: `Signing transaction with key for ${wallet.address}...`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Sign the transaction
      transaction.sign(keyPair);
      
      addLog({
        message: `✓ Transaction signed successfully`,
        status: 'success',
        walletId: wallet.id
      });
      
      // Get the signed XDR
      const xdr = transaction.toXDR();
      
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'submitting' }));
      
      addLog({
        message: `Submitting transaction to network...`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Submit with exponential backoff
      const result = await withExponentialBackoff(() => submitTransaction(xdr));
      
      // Handle success
      if (result.successful) {
        setProcessingBalances(prev => ({ ...prev, [balance.id]: 'completed' }));
        
        addLog({
          message: `Transaction successful! Hash: ${result.hash}`,
          status: 'success',
          walletId: wallet.id
        });
        
        toast.success(`Successfully claimed and transferred ${balance.amount} Pi`);
        
        // Clean up
        claimingRef.current.delete(balance.id);
        delete preparedTransactionsRef.current[balance.id];
        
        // Remove the balance
        removeBalance(balance.id);
      } else {
        // Handle failure with result codes
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
    } catch (error) {
      handleProcessingError(balance, wallet, error);
    }
  }, [addLog, removeBalance]);

  // Handle processing errors with intelligent retry
  const handleProcessingError = useCallback((
    balance: ClaimableBalance,
    wallet: WalletData,
    error: any
  ) => {
    console.error('Transaction error:', error);
    
    setProcessingBalances(prev => ({ ...prev, [balance.id]: 'failed' }));
    
    addLog({
      message: `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 'error',
      walletId: wallet.id
    });
    
    // Clean up
    clearTimeout(timerRefsRef.current[balance.id]);
    delete timerRefsRef.current[balance.id];
    claimingRef.current.delete(balance.id);
    
    // Determine retry strategy based on error
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // If it's a sequence number issue, retry more aggressively
    if (errorMessage.includes('tx_bad_seq') || errorMessage.includes('sequence')) {
      addLog({
        message: 'Sequence number issue detected, retrying in 5 seconds',
        status: 'warning',
        walletId: wallet.id
      });
      
      // Retry sooner for sequence issues
      timerRefsRef.current[balance.id] = setTimeout(() => {
        // Make sure to clear the prepared transaction so we get a fresh sequence number
        delete preparedTransactionsRef.current[balance.id];
        startProcessingBalance(balance);
      }, 5000);
    } else {
      // For other errors, use a longer backoff
      const retryTime = 30000; // 30 seconds
      
      addLog({
        message: `Will retry in ${retryTime/1000} seconds`,
        status: 'warning',
        walletId: wallet.id
      });
      
      toast.error('Transaction failed, will retry later');
      
      timerRefsRef.current[balance.id] = setTimeout(() => {
        // For non-sequence errors, we might still want to try with a fresh sequence
        delete preparedTransactionsRef.current[balance.id];
        startProcessingBalance(balance);
      }, retryTime);
    }
  }, [addLog, startProcessingBalance]);

  // Create a helper function to force an immediate claim
  const forceClaimNow = useCallback((balanceId: string) => {
    const balance = claimableBalances.find(b => b.id === balanceId);
    if (!balance) {
      return;
    }
    
    // Clear any existing timers for this balance
    if (timerRefsRef.current[balanceId]) {
      clearTimeout(timerRefsRef.current[balanceId]);
      delete timerRefsRef.current[balanceId];
    }
    
    // Clear claiming status
    claimingRef.current.delete(balanceId);
    
    // Start processing immediately
    startProcessingBalance(balance);
  }, [claimableBalances, startProcessingBalance]);

  return {
    processingBalances,
    forceClaimNow,
    isProcessing: (balanceId: string) => claimingRef.current.has(balanceId)
  };
}
