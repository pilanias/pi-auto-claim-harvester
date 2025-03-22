
import { useState, useEffect, useCallback } from 'react';
import { WalletData, ClaimableBalance, TransactionStatus } from '@/lib/types';
import { fetchSequenceNumber, submitTransaction } from '@/lib/api';
import { toast } from 'sonner';
import * as StellarSdk from '@stellar/stellar-sdk';

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
      // Fetch sequence number directly from the API
      const currentSequence = await fetchSequenceNumber(wallet.address);
      
      addLog({
        message: `Current sequence from API: ${currentSequence}`,
        status: 'info',
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
      
      // Retry after a delay
      const timer = setTimeout(() => {
        startProcessingBalance(balance);
      }, 30000);
      
      setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
    }
  }, [wallets, addLog]);

  // Construct and submit transaction with both claim and payment operations
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
      const sequenceNumber = BigInt(currentSequence);
      const incrementedSequence = sequenceNumber.toString();
      
      addLog({
        message: `Using sequence number: ${incrementedSequence}`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Create a new transaction directly - Using Stellar Labs approach
      const source = new StellarSdk.Account(wallet.address, incrementedSequence);
      
      const transaction = new StellarSdk.TransactionBuilder(source, {
        fee: "1000000", // 0.1 Pi fee to ensure transaction priority
        networkPassphrase: piNetwork,
        timebounds: {
          minTime: 0,
          maxTime: Math.floor(Date.now() / 1000) + 300 // 5 minutes
        }
      })
      .addOperation(
        StellarSdk.Operation.claimClaimableBalance({
          balanceId: balance.id
        })
      )
      .addOperation(
        StellarSdk.Operation.payment({
          destination: wallet.destinationAddress,
          asset: StellarSdk.Asset.native(),
          amount: balance.amount
        })
      )
      .build();
      
      // Log the transaction XDR before signing
      const txXdrBeforeSigning = transaction.toXDR();
      console.log(`Transaction XDR before signing: ${txXdrBeforeSigning}`);
      addLog({
        message: `Transaction built successfully, XDR hash: ${transaction.hash().toString('hex').substring(0, 8)}...`,
        status: 'info',
        walletId: wallet.id
      });
      
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'signing' }));
      addLog({
        message: `Signing transaction with key for ${wallet.address}...`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Sign the transaction using Stellar Labs approach (simplified)
      transaction.sign(keyPair);
      
      // Get the signed XDR for verification
      const xdr = transaction.toXDR();
      console.log(`Transaction XDR after signing: ${xdr}`);
      
      addLog({
        message: `Transaction signed successfully. Signature count: ${transaction.signatures.length}`,
        status: 'info',
        walletId: wallet.id
      });
      
      addLog({
        message: `Transaction details: fee=${transaction.fee}, operations=${transaction.operations.length}`,
        status: 'info',
        walletId: wallet.id
      });
      
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'submitting' }));
      addLog({
        message: `Submitting transaction to network...`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Submit the transaction using Stellar's SDK directly
      try {
        // First try with the built-in server.submitTransaction method
        const transactionResult = await server.submitTransaction(transaction);
        console.log('Transaction submitted successfully via SDK:', transactionResult);
        
        addLog({
          message: `Transaction successful! Hash: ${transactionResult.hash}`,
          status: 'success',
          walletId: wallet.id
        });
        
        toast.success(`Successfully claimed and transferred ${balance.amount} Pi`);
        
        // Remove the balance after successful processing
        removeBalance(balance.id);
        setProcessingBalances(prev => ({ ...prev, [balance.id]: 'completed' }));
      } catch (serverError) {
        console.error('Error submitting via SDK, trying API fallback:', serverError);
        
        // Fall back to API method if server.submitTransaction fails
        try {
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
        } catch (apiError) {
          throw apiError; // Rethrow for consistent error handling below
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
      console.log('Full error details:', error);
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
          
          // Start over with a fresh sequence number
          const timer = setTimeout(() => {
            startProcessingBalance(balance);
          }, 5000); // Shorter retry for sequence issues
          
          setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
          return;
        }
      }
      
      toast.error('Transaction failed, will retry in 30 seconds');
      
      const timer = setTimeout(() => {
        startProcessingBalance(balance);
      }, 30000);
      
      setActiveTimers(prev => ({ ...prev, [balance.id]: timer }));
    }
  }, [addLog, removeBalance, startProcessingBalance]);

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
