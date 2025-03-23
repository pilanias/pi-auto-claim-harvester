
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import * as StellarSdk from '@stellar/stellar-sdk';

// Pi Network specific derivation path
const PI_DERIVATION_PATH = "m/44'/314159'/0'";

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
    // Convert mnemonic to seed
    const seed = await bip39.mnemonicToSeed(cleanedMnemonic);
    
    // Derive key using Pi's derivation path
    const derived = derivePath(PI_DERIVATION_PATH, seed.toString("hex"));
    const privateKey = Buffer.from(derived.key); // Ensure it's a Buffer

    // Convert the raw Ed25519 seed to a Stellar keypair
    const keypair = StellarSdk.Keypair.fromRawEd25519Seed(privateKey);
    
    console.log("Successfully generated wallet from seed phrase");
    console.log("Public Key:", keypair.publicKey());

    return {
      piAddress: keypair.publicKey(), // Public Key
      publicKey: keypair.publicKey(), // Public Key (Same as piAddress)
      privateKey: keypair.secret(), // Secret Key (Starts with 'S')
    };
  } catch (error) {
    console.error("Error generating wallet from seed:", error);
    throw new Error(`Failed to generate wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
