
// Import necessary libraries
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import * as StellarSdk from 'stellar-sdk';
import { Buffer } from 'buffer';

// Polyfill Buffer for browser environments
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
}

// Pi Network BIP-44 derivation path for Ed25519 keys
export const PI_DERIVATION_PATH = "m/44'/314159'/0'";

// Normalize a seed phrase by trimming whitespace and ensuring proper spacing
const normalizeSeedPhrase = (phrase: string): string => {
  return phrase.trim().replace(/\s+/g, ' ');
};

/**
 * Derives a Pi Network keypair from a BIP-39 mnemonic using BIP-44 derivation
 */
export const deriveKeysFromSeedPhrase = async (seedPhrase: string): Promise<{
  publicKey: string;
  secretKey: string;
} | null> => {
  try {
    if (!seedPhrase || seedPhrase.trim().length === 0) {
      throw new Error('Seed phrase is required');
    }

    // Normalize the seed phrase
    const normalizedSeedPhrase = normalizeSeedPhrase(seedPhrase);

    // Validate if the mnemonic is correct
    if (!bip39.validateMnemonic(normalizedSeedPhrase)) {
      throw new Error('Invalid mnemonic phrase!');
    }

    console.log('Attempting standard BIP-39 derivation for:', normalizedSeedPhrase);

    // Generate seed using BIP39 (SYNC version to avoid issues)
    const seed = bip39.mnemonicToSeedSync(normalizedSeedPhrase);
    
    // Derive the key using the BIP-44 path for Pi Network
    // Pass the seed directly, not as a hex string
    const derived = derivePath(PI_DERIVATION_PATH, seed);
    
    if (!derived || !derived.key) {
      throw new Error('Failed to derive key using BIP-44');
    }

    // Create a Stellar keypair from the derived key
    const keypair = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(derived.key));

    console.log('Successfully derived keypair');
    console.log('Public Key:', keypair.publicKey());
    console.log('Secret Key:', keypair.secret().substring(0, 4) + '...');

    return { publicKey: keypair.publicKey(), secretKey: keypair.secret() };

  } catch (error) {
    console.error('Error deriving keys:', error);
    throw new Error(error instanceof Error ? error.message : 'Unknown error');
  }
};

/**
 * Validates a Stellar public and private key pair
 */
export const validateKeyPair = (publicKey: string, privateKey: string): boolean => {
  try {
    // Validate wallet address format
    StellarSdk.StrKey.decodeEd25519PublicKey(publicKey);
    
    // Validate private key format
    if (!privateKey.startsWith('S')) {
      throw new Error('Invalid private key format. Must start with "S"');
    }
    
    // Decode private key
    StellarSdk.StrKey.decodeEd25519SecretSeed(privateKey);
    
    // Validate that the private key corresponds to the public key
    const keyPair = StellarSdk.Keypair.fromSecret(privateKey);
    const derivedPublicKey = keyPair.publicKey();
    
    return derivedPublicKey === publicKey;
  } catch (error) {
    console.error('Invalid key pair:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
};

/**
 * Validates a Stellar address
 */
export const validateStellarAddress = (address: string): boolean => {
  try {
    StellarSdk.StrKey.decodeEd25519PublicKey(address);
    return true;
  } catch (error) {
    console.error('Invalid Stellar address:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
};
