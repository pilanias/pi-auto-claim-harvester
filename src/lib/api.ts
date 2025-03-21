
// Simulated API calls - These would be real API calls in production
import { toast } from "sonner";

// Fetch claimable balances for a wallet address
export const fetchClaimableBalances = async (walletAddress: string) => {
  try {
    // In a real implementation, this would be:
    // const response = await fetch(`https://api.mainnet.minepi.com/claimable_balances/?claimant=${walletAddress}`);
    // return await response.json();
    
    // For demo purposes, simulate API response with random data
    return {
      _embedded: {
        records: generateMockClaimableBalances(walletAddress)
      }
    };
  } catch (error) {
    console.error("Error fetching claimable balances:", error);
    toast.error("Failed to fetch claimable balances");
    throw error;
  }
};

// Fetch sequence number for an account
export const fetchSequenceNumber = async (sourceAddress: string) => {
  try {
    // In a real implementation, this would be:
    // const response = await fetch(`https://api.mainnet.minepi.com/accounts/${sourceAddress}`);
    // const data = await response.json();
    // return (BigInt(data.sequence) + 1n).toString();
    
    // For demo purposes, simulate API response
    const mockSequence = Math.floor(Math.random() * 1000000000000).toString();
    await new Promise(resolve => setTimeout(resolve, 800)); // Simulate network delay
    
    return (BigInt(mockSequence) + 1n).toString();
  } catch (error) {
    console.error("Error fetching sequence number:", error);
    toast.error("Failed to fetch sequence number");
    throw error;
  }
};

// Submit transaction
export const submitTransaction = async (xdr: string) => {
  try {
    // In a real implementation, this would be:
    // const response = await fetch('https://api.mainnet.minepi.com/transactions', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ xdr })
    // });
    // return await response.json();
    
    // For demo purposes, simulate API response
    await new Promise(resolve => setTimeout(resolve, 1200)); // Simulate network delay
    
    // 10% chance of failure to demonstrate error handling
    if (Math.random() < 0.1) {
      throw new Error("Transaction submission failed");
    }
    
    return {
      hash: generateRandomHash(),
      successful: true
    };
  } catch (error) {
    console.error("Error submitting transaction:", error);
    toast.error("Transaction submission failed");
    throw error;
  }
};

// Mock data generators
function generateMockClaimableBalances(walletAddress: string) {
  const count = Math.floor(Math.random() * 3) + 1; // 1-3 balances
  const records = [];
  
  for (let i = 0; i < count; i++) {
    const now = new Date();
    // Random unlock time between 30 seconds and 5 minutes from now
    const unlockTime = new Date(now.getTime() + (Math.random() * 270000 + 30000));
    
    records.push({
      id: generateRandomHash(),
      amount: (Math.random() * 100 + 5).toFixed(7),
      claimants: [
        {
          destination: walletAddress,
          predicate: { abs_before: unlockTime.toISOString() }
        }
      ]
    });
  }
  
  return records;
}

function generateRandomHash() {
  return [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}
