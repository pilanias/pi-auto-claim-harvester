
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
      // Fetch sequence number directly from the API, don't modify it
      const currentSequence = await fetchSequenceNumber(wallet.address);
      
      // Log the current sequence number exactly as received
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
    // Update status to constructing
    setProcessingBalances(prev => ({ ...prev, [balance.id]: 'constructing' }));
    
    addLog({
      message: `Constructing transaction for ${balance.amount} Pi`,
      status: 'info',
      walletId: wallet.id
    });
    
    try {
      // Use the exact sequence number from the API
      // Create Account using the current sequence number without modification
      const sourceAccount = new StellarSdk.Account(wallet.address, currentSequence);
      
      addLog({
        message: `Creating transaction with current sequence number: ${currentSequence}`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Verify private key starts with 'S'
      if (!wallet.privateKey.startsWith('S')) {
        addLog({
          message: `WARNING: Private key doesn't start with 'S', might not be valid`,
          status: 'warning', 
          walletId: wallet.id
        });
      }
      
      // Build transaction with exactly 20000 stroops fee
      let transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: "20000", // Using exactly 20,000 stroops (0.00002 Pi) for transaction fee
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
      .setTimeout(0) // No timeout
      .build();
      
      // Log the transaction details for debugging
      const txXDR = transaction.toXDR();
      console.log(`Transaction XDR before signing: ${txXDR}`);
      
      // Update status to signing
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'signing' }));
      
      addLog({
        message: 'Signing transaction with private key',
        status: 'info',
        walletId: wallet.id
      });
      
      try {
        // Clean any whitespace from private key
        const cleanPrivateKey = wallet.privateKey.trim();
        
        // Sign transaction with private key - handle any key related errors
        const keyPair = StellarSdk.Keypair.fromSecret(cleanPrivateKey);
        
        // Log the public key from the private key to verify it matches
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
        
        // Sign transaction with the keypair
        transaction.sign(keyPair);
        
        addLog({
          message: 'Transaction signed successfully with correct private key',
          status: 'success',
          walletId: wallet.id
        });
      } catch (signError) {
        throw new Error(`Signing error: ${signError instanceof Error ? signError.message : 'Invalid private key'}`);
      }
      
      // Get transaction XDR
      const xdr = transaction.toXDR();
      
      // Log the signed XDR for debugging
      console.log(`Transaction XDR: ${xdr}`);
      
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
          
          if (result.extras.envelope_xdr) {
            addLog({
              message: `Envelope XDR: ${result.extras.envelope_xdr.substring(0, 30)}...`,
              status: 'info',
              walletId: wallet.id
            });
          }
          
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
