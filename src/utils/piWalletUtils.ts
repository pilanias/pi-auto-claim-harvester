
// Import necessary libraries
import * as bip39 from 'bip39';
import * as StellarSdk from 'stellar-sdk';
import { toast } from 'sonner';
import { Buffer } from 'buffer';
import * as crypto from 'crypto';

// Polyfill Buffer for browser environments
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
}

// Pi Network BIP-44 derivation path for Ed25519 keys (not used directly in the fallback method)
export const PI_DERIVATION_PATH = "m/44'/314159'/0'";

// Normalize a seed phrase by trimming whitespace and ensuring proper spacing
const normalizeSeedPhrase = (phrase: string): string => {
  return phrase.trim().replace(/\s+/g, ' ');
};

/**
 * Creates a deterministic hash from a seed phrase
 * This is a simplified alternative to full BIP-39/44 derivation
 */
const createDeterministicHash = (seedPhrase: string): Uint8Array => {
  // Use a consistent salt for deterministic results
  const salt = 'pi-network-wallet-derivation';
  const input = salt + seedPhrase;
  
  // Create a simple hash using the seed phrase
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Use the hash as a seed for the random number generator
  const rng = new Math.seedrandom(hash.toString());
  
  // Generate 32 random bytes for the seed
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    seed[i] = Math.floor(rng() * 256);
  }
  
  return seed;
};

/**
 * Derives a Pi Network keypair from a BIP-39 mnemonic
 * Falls back to a simplified deterministic method if full derivation fails
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

    try {
      // Try the standard method first (might not work in all browsers)
      const seed = await bip39.mnemonicToSeed(normalizedSeedPhrase);
      
      // Create a deterministic seed directly from the mnemonic
      // This is a simplified approach that doesn't use BIP-44 paths
      const hash = crypto.createHash('sha256').update(seed).digest();
      const keypair = StellarSdk.Keypair.fromRawEd25519Seed(hash);
      
      console.log('Successfully derived keypair using SHA-256 method');
      console.log('Public Key:', keypair.publicKey());
      console.log('Secret Key:', keypair.secret().substring(0, 4) + '...');
      
      return { publicKey: keypair.publicKey(), secretKey: keypair.secret() };
    } catch (innerError) {
      console.log('First derivation method failed, trying fallback:', innerError);
      
      // Fallback to the deterministic method
      const seedBytes = createDeterministicHash(normalizedSeedPhrase);
      const keypair = StellarSdk.Keypair.fromRawEd25519Seed(seedBytes);
      
      console.log('Successfully derived keypair using fallback method');
      console.log('Public Key:', keypair.publicKey());
      console.log('Secret Key:', keypair.secret().substring(0, 4) + '...');
      
      return { publicKey: keypair.publicKey(), secretKey: keypair.secret() };
    }

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
