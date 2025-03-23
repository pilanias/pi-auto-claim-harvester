
import { toast } from "sonner";
import * as StellarSdk from '@stellar/stellar-sdk';

// Pi Network API base URL
const PI_API_BASE_URL = "https://api.mainnet.minepi.com";

// Network passphrase for Pi Network (same as Stellar public network)
export const NETWORK_PASSPHRASE = StellarSdk.Networks.PUBLIC;

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

// Generate transaction hash from XDR
export const getTransactionHash = (xdr: string): string => {
  try {
    const transaction = StellarSdk.TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
    return transaction.hash().toString('hex');
  } catch (error) {
    console.error("Error generating transaction hash:", error);
    throw new Error(`Failed to generate transaction hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Sign transaction with key (like Stellar Lab)
export const signTransaction = (xdr: string, secretKey: string): string => {
  try {
    // Parse the transaction from XDR
    const transaction = StellarSdk.TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
    
    // Create keypair from secret key
    const keyPair = StellarSdk.Keypair.fromSecret(secretKey);
    
    // Sign the transaction (this modifies the transaction in-place)
    transaction.sign(keyPair);
    
    // Convert back to XDR
    return transaction.toXDR();
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
