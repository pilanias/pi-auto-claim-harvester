
import fetch from 'node-fetch';
import * as StellarSdk from 'stellar-sdk';
import dotenv from 'dotenv';
import { logError } from './logService.js';

// Load environment variables
dotenv.config();

// Pi Network API base URL
const PI_API_BASE_URL = process.env.PI_API_BASE_URL || 'https://api.mainnet.minepi.com';

// Network passphrase
const NETWORK_PASSPHRASE = process.env.PI_NETWORK_PASSPHRASE || 'Pi Network';

/**
 * Fetch claimable balances for a wallet address
 * @param {string} walletAddress - The wallet address
 * @returns {Object} The claimable balances response
 */
export const fetchClaimableBalances = async (walletAddress) => {
  try {
    const response = await fetch(`${PI_API_BASE_URL}/claimable_balances/?claimant=${walletAddress}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logError(`Error fetching claimable balances for ${walletAddress}`, error);
    throw error;
  }
};

/**
 * Fetch sequence number for an account
 * @param {string} sourceAddress - The account address
 * @returns {string} The account sequence number
 */
export const fetchSequenceNumber = async (sourceAddress) => {
  try {
    console.log(`Fetching sequence number for account: ${sourceAddress}`);
    
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
    
    console.log(`Raw sequence number received for ${sourceAddress}: ${data.sequence} (type: ${typeof data.sequence})`);
    
    return data.sequence;
  } catch (error) {
    logError(`Error fetching sequence number for ${sourceAddress}`, error);
    throw error;
  }
};

/**
 * Generate transaction hash from XDR
 * @param {string} xdr - The transaction XDR
 * @returns {string} The transaction hash
 */
export const getTransactionHash = (xdr) => {
  try {
    // Parse the transaction envelope from XDR
    const transactionEnvelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(xdr, 'base64');
    
    // Create a transaction object with the correct network passphrase
    const tx = new StellarSdk.Transaction(transactionEnvelope, NETWORK_PASSPHRASE);
    
    // Get the hash
    return tx.hash().toString('hex');
  } catch (error) {
    logError('Error generating transaction hash', error);
    throw error;
  }
};

/**
 * Submit transaction to Pi Network
 * @param {string} xdr - The signed transaction XDR
 * @returns {Object} The transaction response
 */
export const submitTransaction = async (xdr) => {
  try {
    console.log(`Submitting transaction XDR: ${xdr}`);
    
    // Get the transaction hash for logging
    const txHash = getTransactionHash(xdr);
    console.log(`Transaction hash: ${txHash}`);
    
    // Submit transaction to Pi Network
    const response = await fetch(`${PI_API_BASE_URL}/transactions`, {
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
      // Enhanced error handling
      if (responseData.extras && responseData.extras.result_codes) {
        console.error("Transaction failed with API result codes:", responseData.extras.result_codes);
        
        const txCode = responseData.extras.result_codes.transaction;
        if (txCode === "tx_bad_auth") {
          throw new Error("Transaction authentication failed. The signature is invalid.");
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
    logError('Error submitting transaction', error);
    throw error;
  }
};
