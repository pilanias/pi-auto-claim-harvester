
import { toast } from "sonner";

// Pi Network API base URL
const PI_API_BASE_URL = "https://api.mainnet.minepi.com";

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
    // First check account directly using Horizon API
    const response = await fetch(`${PI_API_BASE_URL}/accounts/${sourceAddress}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Explicitly log the sequence number we get from the API
    console.log(`Raw sequence number from API for ${sourceAddress}: ${data.sequence}`);
    
    // Return the exact sequence number without incrementing
    return data.sequence;
  } catch (error) {
    console.error("Error fetching sequence number:", error);
    toast.error("Failed to fetch sequence number");
    throw error;
  }
};

// Submit transaction
export const submitTransaction = async (xdr: string) => {
  try {
    // Make an actual API call to submit the transaction to the Pi Network
    const response = await fetch(`${PI_API_BASE_URL}/transactions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tx: xdr })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error submitting transaction:", error);
    toast.error("Transaction submission failed");
    throw error;
  }
};
