
import { v4 as uuidv4 } from 'uuid';
import { addLog, logError } from './logService.js';
import { startMonitoring, stopMonitoring } from './walletMonitor.js';

// In-memory storage for wallets (in production, use a database)
let wallets = [];

/**
 * Add a new wallet for monitoring
 * @param {Object} walletData - The wallet data
 * @returns {Object} The created wallet
 */
export const addWallet = async (walletData) => {
  try {
    // Create a new wallet object with ID and timestamp
    const newWallet = {
      id: uuidv4(),
      address: walletData.address,
      privateKey: walletData.privateKey, // Store securely in production
      destinationAddress: walletData.destinationAddress,
      added: new Date()
    };
    
    // Check if wallet already exists
    const existingWallet = wallets.find(w => w.address === newWallet.address);
    if (existingWallet) {
      throw new Error('Wallet with this address already exists');
    }
    
    // Add to wallets array
    wallets.push(newWallet);
    
    // Log the addition
    addLog({
      message: `New wallet added: ${maskAddress(newWallet.address)}`,
      status: 'success',
      walletId: newWallet.id
    });
    
    // Start monitoring this wallet
    await startMonitoring(newWallet);
    
    // Return the wallet without the private key
    return {
      wallet: {
        id: newWallet.id,
        address: newWallet.address,
        destinationAddress: newWallet.destinationAddress,
        added: newWallet.added
      }
    };
  } catch (error) {
    logError('Failed to add wallet', error);
    throw error;
  }
};

/**
 * Get all wallets
 * @returns {Array} Array of wallets (without private keys)
 */
export const getWallets = () => {
  // Return wallets without private keys
  return wallets.map(wallet => ({
    id: wallet.id,
    address: wallet.address,
    destinationAddress: wallet.destinationAddress,
    added: wallet.added
  }));
};

/**
 * Get a wallet by ID
 * @param {string} walletId - The wallet ID
 * @returns {Object|null} The wallet or null if not found
 */
export const getWalletById = (walletId) => {
  const wallet = wallets.find(w => w.id === walletId);
  if (!wallet) return null;
  
  // Return without private key
  return {
    id: wallet.id,
    address: wallet.address,
    destinationAddress: wallet.destinationAddress,
    added: wallet.added
  };
};

/**
 * Get a wallet with private key (for internal use only)
 * @param {string} walletId - The wallet ID
 * @returns {Object|null} The complete wallet with private key
 */
export const getWalletWithPrivateKey = (walletId) => {
  return wallets.find(w => w.id === walletId) || null;
};

/**
 * Remove a wallet
 * @param {string} walletId - The wallet ID
 * @returns {boolean} Success status
 */
export const removeWallet = async (walletId) => {
  try {
    const walletToRemove = wallets.find(w => w.id === walletId);
    if (!walletToRemove) {
      throw new Error('Wallet not found');
    }
    
    // Stop monitoring this wallet
    await stopMonitoring(walletId);
    
    // Remove from array
    wallets = wallets.filter(w => w.id !== walletId);
    
    // Log the removal
    addLog({
      message: `Wallet removed: ${maskAddress(walletToRemove.address)}`,
      status: 'info',
      walletId
    });
    
    return true;
  } catch (error) {
    logError('Failed to remove wallet', error, walletId);
    throw error;
  }
};

/**
 * Mask a wallet address for privacy
 * @param {string} address - The wallet address
 * @returns {string} The masked address
 */
export const maskAddress = (address) => {
  if (!address || address.length < 10) return address;
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};
