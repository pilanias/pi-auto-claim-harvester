
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
      
      // Validate private key format
      if (!cleanPrivateKey.startsWith('S')) {
        throw new Error('Invalid private key format - must start with S');
      }
      
      // Create keypair from private key - with additional verification
      let keyPair;
      try {
        keyPair = StellarSdk.Keypair.fromSecret(cleanPrivateKey);
        
        // Log the public key we're using (only first 6 chars for security)
        const publicKeyFromSecret = keyPair.publicKey();
        console.log(`Using keypair with public key: ${publicKeyFromSecret.substring(0, 6)}...`);
        addLog({
          message: `Using signing key starting with: ${publicKeyFromSecret.substring(0, 6)}...`,
          status: 'info',
          walletId: wallet.id
        });
        
        // Validate that keypair matches the wallet address
        if (publicKeyFromSecret !== wallet.address) {
          addLog({
            message: `ERROR: Private key generates address ${publicKeyFromSecret.substring(0, 6)}... but wallet address is ${wallet.address.substring(0, 6)}...`,
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
      
      // Double-check wallet address and transaction params
      addLog({
        message: `Preparing transaction from ${wallet.address.substring(0, 8)}... with sequence ${currentSequence}`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Create source account
      const sourceAccount = new StellarSdk.Account(wallet.address, currentSequence);
      
      // Debug log for source account
      addLog({
        message: `Source account created with address: ${sourceAccount.accountId().substring(0, 8)}...`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Set an even higher base fee to ensure transaction goes through (300,000 stroops = 0.03 Pi)
      let transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: "300000", // Increased fee further to address tx_insufficient_fee
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
          asset: StellarSdk.Asset.native(),
          amount: balance.amount
        })
      )
      .setTimeout(180) // Increased timeout to 180 seconds
      .build();
      
      // Log balance ID for verification
      addLog({
        message: `Claiming balance ID: ${balance.id.substring(0, 15)}...`,
        status: 'info',
        walletId: wallet.id
      });
      
      setProcessingBalances(prev => ({ ...prev, [balance.id]: 'signing' }));
      addLog({
        message: `Signing transaction...`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Sign the transaction with our validated keypair
      transaction.sign(keyPair);
      
      // Get and log the signed XDR (partially, for security)
      const xdr = transaction.toXDR();
      console.log(`Submitting transaction XDR: ${xdr.substring(0, 100)}...`);
      
      addLog({
        message: `Signed transaction ready for submission`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Additional logging for debugging
      addLog({
        message: `Transaction hash: ${transaction.hash().toString('hex').substring(0, 10)}...`,
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
          
          // Enhanced error information
          if (result.extras.envelope_xdr) {
            addLog({
              message: `Envelope XDR: ${result.extras.envelope_xdr.substring(0, 30)}...`,
              status: 'info',
              walletId: wallet.id
            });
          }
          
          if (result.extras.result_xdr) {
            addLog({
              message: `Result XDR: ${result.extras.result_xdr.substring(0, 30)}...`,
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
      
      // Add more detailed error logging
      if (error instanceof Error) {
        console.log('Full error details:', {
          message: error.message,
          stack: error.stack,
        });
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
