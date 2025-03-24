
import { useState, useEffect, useCallback, useRef } from 'react';
import { WalletData, ClaimableBalance, TransactionStatus } from '@/lib/types';
import { fetchSequenceNumber, submitTransaction, NETWORK_PASSPHRASE } from '@/lib/api';
import { toast } from 'sonner';
import * as StellarSdk from '@stellar/stellar-sdk';

// Set up Stellar SDK network configuration to use Pi Network
const server = new StellarSdk.Horizon.Server("https://api.mainnet.minepi.com");

export function useTransaction(
  wallets: WalletData[],
  claimableBalances: ClaimableBalance[],
  removeBalance: (id: string) => void,
  addLog: Function
) {
  const [processingBalances, setProcessingBalances] = useState<Record<string, TransactionStatus>>({});
  const [activeTimers, setActiveTimers] = useState<Record<string, NodeJS.Timeout>>({});
  const sequenceCache = useRef<Record<string, { sequence: string, timestamp: number }>>({});
  
  // Helper function to format time remaining
  const formatTimeRemaining = useCallback((milliseconds: number): string => {
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
  }, []);

  // Define constructAndSubmitTransaction first, before it's referenced by other functions
  const constructAndSubmitTransaction = useCallback(async (
    balance: ClaimableBalance, 
    wallet: WalletData, 
    currentSequence: string
  ) => {
    setProcessingBalances(prev => ({ ...prev, [balance.id]: 'constructing' }));
    
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
      
      // Log first 4 characters of private key (safely) for debugging
      console.log(`Using private key starting with: ${cleanPrivateKey.substring(0, 4)}***`);
      addLog({
        message: `Using private key starting with: ${cleanPrivateKey.substring(0, 4)}***`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Validate private key format
      if (!cleanPrivateKey.startsWith('S')) {
        throw new Error('Invalid private key format - must start with S');
      }
      
      // Create keypair from private key - with additional verification
      let keyPair;
      try {
        keyPair = StellarSdk.Keypair.fromSecret(cleanPrivateKey);
        
        // Log the public key we're using
        const publicKeyFromSecret = keyPair.publicKey();
        console.log(`Using keypair with public key: ${publicKeyFromSecret}`);
        addLog({
          message: `Using signing key: ${publicKeyFromSecret}`,
          status: 'info',
          walletId: wallet.id
        });
        
        // Validate that keypair matches the wallet address
        if (publicKeyFromSecret !== wallet.address) {
          addLog({
            message: `ERROR: Private key generates address ${publicKeyFromSecret} but wallet address is ${wallet.address}`,
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
      
      addLog({
        message: `Using sequence string: ${sequenceAsString}`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Create the source account with the proper sequence format
      const sourceAccount = new StellarSdk.Account(wallet.address, sequenceAsString);
      
      // Debug log for source account
      addLog({
        message: `Source account created with address: ${sourceAccount.accountId()}`,
        status: 'info',
        walletId: wallet.id
      });
      
      // IMPORTANT: Make sure we're using the correct network passphrase for Pi
      addLog({
        message: `Using network passphrase: ${NETWORK_PASSPHRASE}`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Try a higher base fee (0.1 Pi = 1,000,000 stroops)
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
      
      // Log the transaction details before signing
      const txXdrBeforeSigning = transaction.toXDR();
      console.log(`Transaction XDR before signing: ${txXdrBeforeSigning}`);
      addLog({
        message: `Transaction built successfully, ready for signing`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Get the transaction hash before signing for verification
      const txHashBeforeSigning = transaction.hash().toString('hex');
      addLog({
        message: `Transaction hash before signing: ${txHashBeforeSigning}`,
        status: 'info',
        walletId: wallet.id
      });
      
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'signing' }));
      addLog({
        message: `Signing transaction with key for ${wallet.address}...`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Sign the transaction with our validated keypair
      transaction.sign(keyPair);
      
      addLog({
        message: `✓ Transaction signed successfully`,
        status: 'success',
        walletId: wallet.id
      });
      
      // Get the signed XDR for verification
      const xdr = transaction.toXDR();
      console.log(`Transaction XDR after signing: ${xdr}`);
      
      addLog({
        message: `Signed transaction XDR hash: ${transaction.hash().toString('hex').substring(0, 16)}...`,
        status: 'info',
        walletId: wallet.id
      });

      // Log the full transaction details
      addLog({
        message: `Transaction details: fee=${transaction.fee}, operations=${transaction.operations.length}, signatures=${transaction.signatures.length}`,
        status: 'info',
        walletId: wallet.id
      });
      
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'submitting' }));
      addLog({
        message: `Submitting transaction to network...`,
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
          message: `Transaction successful! Hash: ${result.hash}`,
          status: 'success',
          walletId: wallet.id
        });
        
        toast.success(`Successfully claimed and transferred ${balance.amount} Pi`);
        
        // Remove the balance after successful processing
        removeBalance(balance.id);
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
      
      // Additional handling for specific error types
      if (error instanceof Error) {
        const errorMessage = error.message;
        
        // If it's a sequence number issue, fetch a new sequence and retry
        if (errorMessage.includes('tx_bad_seq') || errorMessage.includes('sequence')) {
          addLog({
            message: 'Sequence number issue detected, fetching fresh sequence...',
            status: 'info', 
            walletId: wallet.id
          });
          
          // Clear cached sequence for this wallet
          if (wallet.address in sequenceCache.current) {
            delete sequenceCache.current[wallet.address];
          }
          
          // Start over with a fresh sequence number
          const timer = setTimeout(() => {
            startProcessingBalance(balance);
          }, 2000); // Shorter retry for sequence issues
          
          setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
          return;
        }
      }
      
      toast.error('Transaction failed, will retry in 10 seconds');
      
      const timer = setTimeout(() => {
        startProcessingBalance(balance);
      }, 10000);
      
      setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
    }
  }, [addLog, removeBalance]);

  // Now define startProcessingBalance after constructAndSubmitTransaction
  const startProcessingBalance = useCallback(async (balance: ClaimableBalance) => {
    const wallet = wallets.find(w => w.id === balance.walletId);
    if (!wallet) {
      console.error('Wallet not found for balance:', balance);
      return;
    }
    
    // Check if we have a recent cached sequence number
    const cachedSequence = sequenceCache.current[wallet.address];
    const now = Date.now();
    
    // If we have a recent sequence number (less than 30 seconds old), use it
    if (cachedSequence && (now - cachedSequence.timestamp) < 30000) {
      addLog({
        message: `Using cached sequence number: ${cachedSequence.sequence}`,
        status: 'info',
        walletId: wallet.id
      });
      
      constructAndSubmitTransaction(balance, wallet, cachedSequence.sequence);
      return;
    }
    
    // Otherwise, fetch a new sequence number
    // Update status to fetching sequence
    setProcessingBalances(prev => ({ ...prev, [balance.id]: 'fetching_sequence' }));
    
    addLog({
      message: `Fetching sequence number for wallet ${wallet.address.substring(0, 6)}...`,
      status: 'info',
      walletId: wallet.id
    });
    
    try {
      // Fetch sequence number directly from the API
      const currentSequence = await fetchSequenceNumber(wallet.address);
      
      addLog({
        message: `Current sequence from API: ${currentSequence}`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Update cache
      sequenceCache.current[wallet.address] = {
        sequence: currentSequence,
        timestamp: now
      };
      
      // Check if we need to wait for unlock time
      const unlockTime = new Date(balance.unlockTime).getTime();
      const timeUntilUnlock = unlockTime - now;
      
      if (timeUntilUnlock > 1000) {
        // Set status to waiting
        setProcessingBalances(prev => ({ ...prev, [balance.id]: 'waiting' }));
        
        addLog({
          message: `Waiting ${formatTimeRemaining(timeUntilUnlock)} until unlock time`,
          status: 'info',
          walletId: wallet.id
        });
        
        // Set timer to construct transaction at unlock time
        const timer = setTimeout(() => {
          constructAndSubmitTransaction(balance, wallet, currentSequence);
        }, timeUntilUnlock + 500); // Add a small buffer after unlock
        
        setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
      } else {
        // Already unlocked, construct and submit transaction immediately
        constructAndSubmitTransaction(balance, wallet, currentSequence);
      }
    } catch (error) {
      console.error('Error fetching sequence number:', error);
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'failed' }));
      
      addLog({
        message: `Failed to fetch sequence number: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error',
        walletId: wallet.id
      });
      
      // Retry after a short delay
      const timer = setTimeout(() => {
        startProcessingBalance(balance);
      }, 5000);
      
      setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
    }
  }, [wallets, addLog, constructAndSubmitTransaction, formatTimeRemaining]);

  // Pre-fetch sequence number before unlock time to speed up transaction preparation
  const prefetchSequenceNumber = useCallback(async (balance: ClaimableBalance) => {
    const wallet = wallets.find(w => w.id === balance.walletId);
    if (!wallet) {
      console.error('Wallet not found for balance:', balance);
      return;
    }
    
    try {
      // Update status to fetching sequence
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'fetching_sequence' }));
      
      addLog({
        message: `Pre-fetching sequence number for wallet ${wallet.address.substring(0, 6)}...`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Fetch sequence number directly from the API
      const currentSequence = await fetchSequenceNumber(wallet.address);
      
      // Cache the sequence number with a timestamp
      sequenceCache.current[wallet.address] = {
        sequence: currentSequence,
        timestamp: Date.now()
      };
      
      addLog({
        message: `Sequence number cached: ${currentSequence}`,
        status: 'success',
        walletId: wallet.id
      });
      
      // Now calculate the exact time to execute the transaction
      const now = Date.now();
      const unlockTime = new Date(balance.unlockTime).getTime();
      const timeUntilUnlock = unlockTime - now;
      
      // If it's more than 2 seconds away, schedule the transaction at the exact unlock time
      if (timeUntilUnlock > 2000) {
        // Set status to waiting
        setProcessingBalances(prev => ({ ...prev, [balance.id]: 'waiting' }));
        
        addLog({
          message: `Transaction prepared, executing in ${formatTimeRemaining(timeUntilUnlock)}`,
          status: 'info',
          walletId: wallet.id
        });
        
        // Schedule transaction at exact unlock time
        const timer = setTimeout(() => {
          constructAndSubmitTransaction(balance, wallet, currentSequence);
        }, timeUntilUnlock);
        
        setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
      } 
      // If it's very close or already unlocked, execute now
      else {
        constructAndSubmitTransaction(balance, wallet, currentSequence);
      }
    } catch (error) {
      console.error('Error prefetching sequence number:', error);
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'failed' }));
      
      addLog({
        message: `Failed to prefetch sequence number: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error',
        walletId: wallet.id
      });
      
      // Retry after a short delay
      const timer = setTimeout(() => {
        startProcessingBalance(balance);
      }, 5000);
      
      setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
    }
  }, [wallets, addLog, constructAndSubmitTransaction, formatTimeRemaining]);

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
      const now = Date.now();
      const unlockTime = new Date(balance.unlockTime).getTime();
      
      // Skip balances that are already processing or completed
      if (processingBalances[balance.id]) return;
      
      // Calculate milliseconds until unlock
      const timeUntilUnlock = unlockTime - now;
      
      // If it's more than 30 minutes away, we'll fetch sequence number 5 minutes before unlock
      if (timeUntilUnlock > 30 * 60 * 1000) {
        // Schedule to fetch sequence 5 minutes before unlock
        const timeUntilSequenceFetch = timeUntilUnlock - 5 * 60 * 1000;
        
        const timer = setTimeout(() => {
          prefetchSequenceNumber(balance);
        }, timeUntilSequenceFetch);
        
        setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
        
        addLog({
          message: `Will prefetch sequence number in ${formatTimeRemaining(timeUntilSequenceFetch)}`,
          status: 'info',
          walletId: balance.walletId
        });
      }
      // If it's between 5-30 minutes away, fetch sequence number 1 minute before
      else if (timeUntilUnlock > 5 * 60 * 1000) {
        // Schedule to fetch sequence 1 minute before unlock
        const timeUntilSequenceFetch = timeUntilUnlock - 60 * 1000;
        
        const timer = setTimeout(() => {
          prefetchSequenceNumber(balance);
        }, timeUntilSequenceFetch);
        
        setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
        
        addLog({
          message: `Will prefetch sequence number in ${formatTimeRemaining(timeUntilSequenceFetch)}`,
          status: 'info',
          walletId: balance.walletId
        });
      }
      // If it's between 30 seconds and 5 minutes away, fetch sequence number 30 seconds before
      else if (timeUntilUnlock > 30 * 1000) {
        // Schedule to fetch sequence 30 seconds before unlock
        const timeUntilSequenceFetch = timeUntilUnlock - 30 * 1000;
        
        const timer = setTimeout(() => {
          prefetchSequenceNumber(balance);
        }, timeUntilSequenceFetch);
        
        setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
        
        addLog({
          message: `Will prefetch sequence number in ${formatTimeRemaining(timeUntilSequenceFetch)}`,
          status: 'info',
          walletId: balance.walletId
        });
      }
      // If it's between 5-30 seconds away, fetch sequence number right now
      else if (timeUntilUnlock > 5 * 1000) {
        // Fetch sequence immediately
        const timer = setTimeout(() => {
          prefetchSequenceNumber(balance);
        }, 0);
        
        setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
        
        addLog({
          message: `Prefetching sequence number now for upcoming unlock`,
          status: 'info',
          walletId: balance.walletId
        });
      }
      // If it's less than 5 seconds away or already unlocked, start processing immediately
      else {
        const timer = setTimeout(() => {
          startProcessingBalance(balance);
        }, 0);
        
        setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
        
        // If it's already unlocked, log that
        if (timeUntilUnlock <= 0) {
          addLog({
            message: `Processing already unlocked balance of ${balance.amount} Pi`,
            status: 'info',
            walletId: balance.walletId
          });
        } else {
          addLog({
            message: `Balance unlocking in ${formatTimeRemaining(timeUntilUnlock)}, preparing transaction`,
            status: 'info',
            walletId: balance.walletId
          });
        }
      }
    });
  }, [claimableBalances, processingBalances, activeTimers, addLog, prefetchSequenceNumber, startProcessingBalance, formatTimeRemaining]);

  return {
    processingBalances,
    formatTimeRemaining
  };
}
