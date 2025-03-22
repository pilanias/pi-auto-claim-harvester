
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
  const transactionRetriesRef = useRef<Record<string, number>>({});
  const MAX_RETRIES = 5;

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
    
    // Reset retry count on new processing attempt
    transactionRetriesRef.current[balance.id] = 0;
    
    // Update status to fetching sequence
    setProcessingBalances(prev => ({ ...prev, [balance.id]: 'fetching_sequence' }));
    
    addLog({
      message: `Preparing to claim ${balance.amount} Pi from wallet ${wallet.address.substring(0, 6)}...`,
      status: 'info',
      walletId: wallet.id
    });
    
    try {
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
      console.error('Error starting process:', error);
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'failed' }));
      
      addLog({
        message: `Failed to start processing: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    // Increment retry counter
    const retryCount = (transactionRetriesRef.current[balance.id] || 0) + 1;
    transactionRetriesRef.current[balance.id] = retryCount;
    
    if (retryCount > MAX_RETRIES) {
      addLog({
        message: `Maximum retry attempts (${MAX_RETRIES}) reached for balance ${balance.id}. Please try again manually.`,
        status: 'error',
        walletId: wallet.id
      });
      
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'failed' }));
      toast.error(`Failed to process balance after ${MAX_RETRIES} attempts`);
      return;
    }
    
    // Update status to constructing
    setProcessingBalances(prev => ({ ...prev, [balance.id]: 'constructing' }));
    
    addLog({
      message: `Constructing transaction for ${balance.amount} Pi (Attempt ${retryCount}/${MAX_RETRIES})`,
      status: 'info',
      walletId: wallet.id
    });
    
    try {
      // ALWAYS get a fresh account for every transaction attempt
      const accountResponse = await server.loadAccount(wallet.address);
      
      // Log the fresh sequence number
      addLog({
        message: `Using fresh sequence number: ${accountResponse.sequence}`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Verify private key format
      if (!wallet.privateKey.startsWith('S')) {
        addLog({
          message: `WARNING: Private key doesn't start with 'S', might not be valid`,
          status: 'warning', 
          walletId: wallet.id
        });
      }
      
      // Clean any whitespace from private key
      const cleanPrivateKey = wallet.privateKey.trim();
      
      // Try to derive public key from private key to validate
      try {
        const keyPair = StellarSdk.Keypair.fromSecret(cleanPrivateKey);
        const derivedPublicKey = keyPair.publicKey();
        
        addLog({
          message: `Public key derived from private key: ${derivedPublicKey}`,
          status: 'info',
          walletId: wallet.id
        });
        
        // Check if derived public key matches the wallet address
        if (derivedPublicKey !== wallet.address) {
          addLog({
            message: `WARNING: Derived public key (${derivedPublicKey}) doesn't match wallet address (${wallet.address})!`,
            status: 'error',
            walletId: wallet.id
          });
          throw new Error('Private key does not match wallet address');
        }
        
        addLog({
          message: 'Private key validation successful',
          status: 'success',
          walletId: wallet.id
        });
      } catch (keyError) {
        addLog({
          message: `Private key validation error: ${keyError instanceof Error ? keyError.message : 'Invalid private key format'}`,
          status: 'error',
          walletId: wallet.id
        });
        throw new Error('Invalid private key');
      }
      
      // Use a higher fee for priority - increase from previous value
      const fee = "500000"; // 500000 stroops (~0.05 Pi) for higher priority
      
      addLog({
        message: `Setting transaction fee to ${fee} stroops for higher priority`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Build transaction with BOTH claim and payment operations
      let transaction = new StellarSdk.TransactionBuilder(accountResponse, {
        fee,
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
      .setTimeout(60) // Increase timeout to 60 seconds
      .build();
      
      // Update status to signing
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'signing' }));
      
      addLog({
        message: 'Signing transaction with private key',
        status: 'info',
        walletId: wallet.id
      });
      
      // Sign transaction with private key
      const keyPair = StellarSdk.Keypair.fromSecret(cleanPrivateKey);
      transaction.sign(keyPair);
      
      addLog({
        message: 'Transaction signed successfully',
        status: 'success',
        walletId: wallet.id
      });
      
      // Get transaction XDR for logging
      const xdr = transaction.toXDR();
      
      addLog({
        message: `Transaction XDR (first 50 chars): ${xdr.substring(0, 50)}...`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Update status to submitting
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'submitting' }));
      
      addLog({
        message: 'Submitting transaction to Pi Network',
        status: 'info',
        walletId: wallet.id
      });
      
      // Submit the transaction directly using the SDK
      const transactionResult = await server.submitTransaction(transaction);
      
      // Transaction successful
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'completed' }));
      
      addLog({
        message: `Transaction successful! Hash: ${transactionResult.hash}`,
        status: 'success',
        walletId: wallet.id
      });
      
      toast.success(`Successfully claimed and transferred ${balance.amount} Pi`);
      
      // Remove the balance after successful processing
      removeBalance(balance.id);
      
      // Clean up
      delete sequenceNumbersRef.current[balance.id];
      delete transactionRetriesRef.current[balance.id];
      setActiveTimers(prev => {
        const newTimers = { ...prev };
        delete newTimers[balance.id];
        return newTimers;
      });
      
    } catch (error: any) {
      console.error('Transaction error:', error);
      
      let errorMessage = 'Unknown error';
      let retryDelay = 30000; // Default 30 seconds
      
      if (error.response) {
        // Handle Horizon API errors
        try {
          const errorResult = error.response.data;
          
          addLog({
            message: `Error details: ${JSON.stringify(errorResult)}`,
            status: 'error',
            walletId: wallet.id
          });
          
          // Extract error codes
          if (errorResult.extras && errorResult.extras.result_codes) {
            const errorCodes = JSON.stringify(errorResult.extras.result_codes);
            errorMessage = `Transaction failed with codes: ${errorCodes}`;
            
            // Log the envelope XDR for debugging
            if (errorResult.extras.envelope_xdr) {
              addLog({
                message: `Envelope XDR: ${errorResult.extras.envelope_xdr}`,
                status: 'info',
                walletId: wallet.id
              });
            }
            
            // Special handling for tx_bad_seq errors
            if (errorResult.extras.result_codes.transaction === 'tx_bad_seq') {
              addLog({
                message: 'Sequence number error detected. Will retry with a fresh sequence number.',
                status: 'warning',
                walletId: wallet.id
              });
              retryDelay = 1000; // Retry much faster for sequence errors (1 second)
            }
            
            // Special handling for tx_bad_auth errors
            if (errorResult.extras.result_codes.transaction === 'tx_bad_auth') {
              addLog({
                message: 'Authentication error. The private key might be incorrect or the account might not have enough funds.',
                status: 'error',
                walletId: wallet.id
              });
              retryDelay = 5000; // Retry a bit slower for auth errors
            }
          }
        } catch (parseError) {
          errorMessage = `Error parsing response: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'failed' }));
      
      addLog({
        message: `Transaction failed: ${errorMessage}`,
        status: 'error',
        walletId: wallet.id
      });
      
      toast.error(`Transaction failed, will retry in ${Math.floor(retryDelay/1000)} seconds`);
      
      // Retry after a delay
      const timer = setTimeout(() => {
        constructAndSubmitTransaction(balance, wallet);
      }, retryDelay);
      
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
