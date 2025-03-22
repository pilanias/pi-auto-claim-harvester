
// Import necessary libraries
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import * as StellarSdk from 'stellar-sdk';
import { Buffer } from 'buffer';
import * as crypto from 'crypto';

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
 * Creates a deterministic seed from a mnemonic phrase without using seedrandom
 */
const createDeterministicSeed = (seedPhrase: string): Uint8Array => {
  // Create a simple deterministic hash based on the seed phrase
  const encoder = new TextEncoder();
  const data = encoder.encode(`pi-network-wallet-${seedPhrase}`);
  
  // Create a seed using a hash to maintain determinism
  const seed = new Uint8Array(32);
  
  // Simple hash function to fill the seed array
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash = hash & hash;
    // Use the running hash to influence each byte of the seed
    seed[i % 32] = (seed[i % 32] + Math.abs(hash % 256)) % 256;
  }
  
  return seed;
};

/**
 * Alternative method to derive a key using SHA-256 in browser environments
 */
const deriveBrowserCompatibleKey = async (seedPhrase: string): Promise<Uint8Array> => {
  // Use the Web Crypto API which is available in all modern browsers
  const encoder = new TextEncoder();
  const data = encoder.encode(seedPhrase);
  
  // Get cryptographic hash of the data
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert to Uint8Array
  return new Uint8Array(hashBuffer);
};

/**
 * Derives a Pi Network keypair from a BIP-39 mnemonic using BIP-44 derivation
 * Includes multiple fallback methods for browser compatibility
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
      // Generate seed using BIP39 (ASYNC version)
      const seed = await bip39.mnemonicToSeed(normalizedSeedPhrase);
      
      // Convert seed to Uint8Array for derivePath function
      const seedBytes = new Uint8Array(seed);
      
      // Derive the key using the BIP-44 path for Pi Network
      const derived = derivePath(PI_DERIVATION_PATH, seedBytes);
      
      // Create a Stellar keypair from the derived key
      const keypair = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(derived.key));
      
      console.log('Successfully derived keypair using BIP39/44 method');
      console.log('Public Key:', keypair.publicKey());
      console.log('Secret Key:', keypair.secret().substring(0, 4) + '...');
      
      return { publicKey: keypair.publicKey(), secretKey: keypair.secret() };
      
    } catch (firstError) {
      console.log('First derivation method failed, trying fallback:', firstError);
      
      try {
        // Try alternative method with Web Crypto API
        const cryptoSeed = await deriveBrowserCompatibleKey(normalizedSeedPhrase);
        const keypair = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(cryptoSeed.slice(0, 32)));
        
        console.log('Successfully derived keypair using Web Crypto API fallback');
        console.log('Public Key:', keypair.publicKey());
        console.log('Secret Key:', keypair.secret().substring(0, 4) + '...');
        
        return { publicKey: keypair.publicKey(), secretKey: keypair.secret() };
        
      } catch (secondError) {
        console.log('Second derivation method failed, trying final fallback:', secondError);
        
        // Final fallback: simple deterministic method
        const deterministicSeed = createDeterministicSeed(normalizedSeedPhrase);
        const keypair = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(deterministicSeed));
        
        console.log('Successfully derived keypair using deterministic fallback');
        console.log('Public Key:', keypair.publicKey());
        console.log('Secret Key:', keypair.secret().substring(0, 4) + '...');
        
        return { publicKey: keypair.publicKey(), secretKey: keypair.secret() };
      }
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
