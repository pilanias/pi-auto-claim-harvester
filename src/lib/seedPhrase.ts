
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import * as StellarSdk from '@stellar/stellar-sdk';

// Pi Network specific derivation path
const PI_DERIVATION_PATH = "m/44'/314159'/0'";

/**
 * Validates a mnemonic phrase (seed phrase)
 */
export const validateMnemonic = (mnemonic: string): boolean => {
  return bip39.validateMnemonic(mnemonic);
};

/**
 * Generates a Pi wallet (address and private key) from a mnemonic phrase
 */
export const generatePiWallet = async (mnemonic: string): Promise<{
  piAddress: string;
  publicKey: string;
  privateKey: string;
}> => {
  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase! Please check your 24 words and try again.");
  }

  // Convert mnemonic to seed
  const seed = await bip39.mnemonicToSeed(mnemonic);
  
  // Derive key using Pi's derivation path
  const derived = derivePath(PI_DERIVATION_PATH, seed.toString("hex"));
  const privateKey = Buffer.from(derived.key); // Ensure it's a Buffer

  // Convert the raw Ed25519 seed to a Stellar keypair
  const keypair = StellarSdk.Keypair.fromRawEd25519Seed(privateKey);

  return {
    piAddress: keypair.publicKey(), // Public Key
    publicKey: keypair.publicKey(), // Public Key (Same as piAddress)
    privateKey: keypair.secret(), // Secret Key (Starts with 'S')
  };
};
