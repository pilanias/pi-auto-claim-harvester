
import { toast } from "sonner";
import * as StellarSdk from '@stellar/stellar-sdk';

// Simulate backend storage in memory
// In a real app, this would be on a server
const backendStorage = {
  monitoredWallets: new Map(), // Store monitored wallets in memory
};

// Pi Network API base URL
const PI_API_BASE_URL = "https://api.mainnet.minepi.com";

// Network passphrase for Pi Network (correct one from status)
export const NETWORK_PASSPHRASE = "Pi Network";

// Generate Pi wallet from seed phrase (simulated backend)
export const generatePiWalletBackend = async (seedPhrase: string) => {
  try {
    // Simulate backend processing
    console.log("Simulating backend wallet generation from seed phrase");
    
    // This would normally be done on the backend
    // For demo purposes, we're returning a fixed demo wallet
    return {
      piAddress: "GAJZO5B4KBDBO4EYFIT", // Demo address
      publicKey: "GAJZO5B4KBDBO4EYFIT", // Same as address
      privateKey: "SDCTDFOZ226HUCHLJ6C4UOGCTREJPHAT5NOMRMGNVXYQXXNXH7AZFBJG", // Demo private key
    };
  } catch (error) {
    console.error("Error in simulated backend wallet generation:", error);
    toast.error("Failed to generate wallet");
    throw error;
  }
};

// Start monitoring a wallet (simulated backend)
export const startWalletMonitoring = async (walletData: { 
  address: string;
  privateKey: string;
  destinationAddress: string;
}) => {
  try {
    console.log("Simulating backend wallet monitoring for:", walletData.address);
    
    // Store the wallet data in our simulated backend storage
    backendStorage.monitoredWallets.set(walletData.address, {
      ...walletData,
      monitoringStarted: new Date(),
      status: 'active'
    });
    
    // Return a success response
    return {
      success: true,
      message: "Wallet monitoring started successfully",
      walletId: walletData.address // Using address as ID for simplicity
    };
  } catch (error) {
    console.error("Error in simulated backend wallet monitoring:", error);
    toast.error("Failed to start wallet monitoring");
    throw error;
  }
};

// Stop monitoring a wallet (simulated backend)
export const stopWalletMonitoring = async (walletId: string) => {
  try {
    console.log("Simulating stopping backend wallet monitoring for ID:", walletId);
    
    // Remove from simulated backend storage
    backendStorage.monitoredWallets.delete(walletId);
    
    // Return a success response
    return {
      success: true,
      message: "Wallet monitoring stopped successfully"
    };
  } catch (error) {
    console.error("Error stopping simulated backend wallet monitoring:", error);
    toast.error("Failed to stop wallet monitoring");
    throw error;
  }
};

// Get backend status/logs for a specific wallet (simulated)
export const getWalletStatus = async (walletId: string) => {
  try {
    console.log("Simulating getting backend wallet status for:", walletId);
    
    const wallet = backendStorage.monitoredWallets.get(walletId);
    
    if (!wallet) {
      return {
        status: 'unknown',
        message: 'Wallet not found in monitoring system'
      };
    }
    
    return {
      status: wallet.status || 'active',
      lastChecked: new Date(),
      message: 'Monitoring active, waiting for claimable balances'
    };
  } catch (error) {
    console.error("Error getting simulated wallet status:", error);
    toast.error("Failed to fetch wallet status");
    throw error;
  }
};

// These functions can still make real network requests to Pi Network API
// since they don't require backend processing

// Fetch claimable balances for a wallet address
export const fetchClaimableBalances = async (walletAddress: string) => {
  try {
    // Make an actual API call to the Pi Network
    const response = await fetch(`${PI_API_BASE_URL}/claimable_balances/?claimant=${walletAddress}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching claimable balances:", error);
    toast.error("Failed to fetch claimable balances");
    throw error;
  }
};

// Fetch sequence number for an account
export const fetchSequenceNumber = async (sourceAddress: string) => {
  try {
    console.log(`Fetching sequence number for account: ${sourceAddress}`);
    
    // Use the accounts endpoint directly
    const response = await fetch(`${PI_API_BASE_URL}/accounts/${sourceAddress}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: `HTTP error: ${response.status}` }));
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.sequence) {
      console.error("No sequence number found in API response:", data);
      throw new Error("Sequence number not found in account data");
    }
    
    // Log the raw sequence number exactly as received
    console.log(`Raw sequence number received for ${sourceAddress}: ${data.sequence} (type: ${typeof data.sequence})`);
    
    // Return the sequence as a string without any modification
    return data.sequence;
  } catch (error) {
    console.error("Error fetching sequence number:", error);
    toast.error("Failed to fetch sequence number");
    throw error;
  }
};

// Generate transaction hash from XDR - FIXED TO MATCH PI NETWORK EXACTLY
export const getTransactionHash = (xdr: string): string => {
  try {
    // Parse the transaction envelope from XDR
    const transactionEnvelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(xdr, 'base64');
    
    // Create a transaction object with the correct network passphrase
    const tx = new StellarSdk.Transaction(transactionEnvelope, NETWORK_PASSPHRASE);
    
    // Get the hash
    return tx.hash().toString('hex');
  } catch (error) {
    console.error("Error generating transaction hash:", error);
    throw new Error(`Failed to generate transaction hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Sign transaction with key (exactly like Stellar Lab)
export const signTransaction = (xdr: string, secretKey: string): string => {
  try {
    // First calculate the hash using the correct network passphrase
    const txHash = getTransactionHash(xdr);
    console.log(`Transaction hash before signing: ${txHash}`);
    
    // Parse the transaction from XDR using the correct method
    const tx = new StellarSdk.Transaction(
      StellarSdk.xdr.TransactionEnvelope.fromXDR(xdr, 'base64'), 
      NETWORK_PASSPHRASE
    );
    
    // Create keypair from secret key
    const keyPair = StellarSdk.Keypair.fromSecret(secretKey);
    
    // Sign the transaction with the keypair
    tx.sign(keyPair);
    
    // Convert back to XDR
    return tx.toEnvelope().toXDR('base64');
  } catch (error) {
    console.error("Error signing transaction:", error);
    throw new Error(`Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Submit transaction
export const submitTransaction = async (xdr: string) => {
  try {
    console.log(`Submitting transaction XDR: ${xdr}`);
    
    // Get the transaction hash for logging
    const txHash = getTransactionHash(xdr);
    console.log(`Transaction hash: ${txHash}`);
    
    // Make an actual API call to submit the transaction to the Pi Network
    const response = await fetch(`${PI_API_BASE_URL}/transactions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tx: xdr })
    });
    
    // Log the raw response details
    console.log(`Transaction submission response status: ${response.status}`);
    
    const responseData = await response.json();
    
    // Log full response data for debugging
    console.log('Transaction submission response:', responseData);
    
    if (!response.ok) {
      // Enhanced error handling with more details
      if (responseData.extras && responseData.extras.result_codes) {
        console.error("Transaction failed with API result codes:", responseData.extras.result_codes);
        
        // Check for common error types
        const txCode = responseData.extras.result_codes.transaction;
        if (txCode === "tx_bad_auth") {
          console.error("tx_bad_auth error details:", responseData);
          throw new Error("Transaction authentication failed. The signature is invalid. Please verify your private key.");
        } else if (txCode === "tx_bad_seq") {
          throw new Error("Incorrect sequence number. Will retry with updated sequence.");
        } else {
          throw new Error(`API error: ${txCode || JSON.stringify(responseData.extras.result_codes)}`);
        }
      }
      
      throw new Error(responseData.detail || responseData.message || `API error: ${response.status}`);
    }
    
    return responseData;
  } catch (error) {
    console.error("Error submitting transaction:", error);
    toast.error(`Transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    throw error;
  }
};
