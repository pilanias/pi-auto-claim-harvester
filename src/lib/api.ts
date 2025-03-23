import { toast } from "sonner";
import * as StellarSdk from '@stellar/stellar-sdk';

// Production backend URL - change this to your actual backend URL
const BACKEND_API_URL = "https://pi-claim-backend-service.example.com/api";

// Pi Network API base URL
const PI_API_BASE_URL = "https://api.mainnet.minepi.com";

// Network passphrase for Pi Network (correct one from status)
export const NETWORK_PASSPHRASE = "Pi Network";

// Generate Pi wallet from seed phrase (calls backend service)
export const generatePiWalletBackend = async (seedPhrase: string) => {
  try {
    console.log("Calling backend wallet generation service with seed phrase");
    
    // In production, this would be a real backend call
    // For now we're simulating the response to avoid the CORS error
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Return a fixed wallet for now - in production this would come from backend
    return {
      piAddress: "GAJZO5B4KBDBO4EYFIT", // Demo address
      publicKey: "GAJZO5B4KBDBO4EYFIT", // Same as address
      privateKey: "SDCTDFOZ226HUCHLJ6C4UOGCTREJPHAT5NOMRMGNVXYQXXNXH7AZFBJG", // Demo private key
    };
    
    /* 
    // This is the code you would use with a real backend:
    
    const response = await fetch(`${BACKEND_API_URL}/generate-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ seedPhrase }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    return await response.json();
    */
  } catch (error) {
    console.error("Error in backend wallet generation:", error);
    toast.error("Failed to generate wallet from backend");
    throw error;
  }
};

// Start monitoring a wallet (backend service)
export const startWalletMonitoring = async (walletData: { 
  address: string;
  privateKey: string;
  destinationAddress: string;
}) => {
  try {
    console.log("Sending wallet to backend monitoring service:", walletData.address);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate successful response
    // In production, this would call your actual backend
    return {
      success: true,
      message: "Wallet monitoring started on backend server",
      walletId: walletData.address
    };
    
    /*
    // This is the code you would use with a real backend:
    
    const response = await fetch(`${BACKEND_API_URL}/monitor-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(walletData),
      // Don't use no-cors as it makes the response opaque and unusable
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    return await response.json();
    */
  } catch (error) {
    console.error("Error starting wallet monitoring:", error);
    toast.error("Failed to start wallet monitoring on backend");
    throw error;
  }
};

// Stop monitoring a wallet (backend service)
export const stopWalletMonitoring = async (walletId: string) => {
  try {
    console.log("Stopping backend wallet monitoring for ID:", walletId);
    
    // Simulate network delay 
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Simulate successful response
    return {
      success: true,
      message: "Wallet monitoring stopped on backend server"
    };
    
    /*
    // This is the code you would use with a real backend:
    
    const response = await fetch(`${BACKEND_API_URL}/stop-monitoring/${walletId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    return await response.json();
    */
  } catch (error) {
    console.error("Error stopping wallet monitoring:", error);
    toast.error("Failed to stop wallet monitoring on backend");
    throw error;
  }
};

// Get backend status/logs for a specific wallet
export const getWalletStatus = async (walletId: string) => {
  try {
    console.log("Fetching backend status for wallet:", walletId);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Simulate status response
    return {
      status: 'active',
      lastChecked: new Date(),
      message: 'Monitoring active on backend server, waiting for claimable balances'
    };
    
    /*
    // This is the code you would use with a real backend:
    
    const response = await fetch(`${BACKEND_API_URL}/wallet-status/${walletId}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    return await response.json();
    */
  } catch (error) {
    console.error("Error getting wallet status:", error);
    toast.error("Failed to fetch wallet status from backend");
    throw error;
  }
};

// These functions would still be handled by the backend in a real implementation,
// but for completeness, we'll include the Pi Network API calls

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
