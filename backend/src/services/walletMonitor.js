import cron from 'node-cron';
import * as StellarSdk from 'stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { addLog, logError } from './logService.js';
import { getWalletWithPrivateKey } from './walletService.js';
import { fetchClaimableBalances, fetchSequenceNumber, submitTransaction } from './piNetworkApi.js';

// Load environment variables
dotenv.config();

// Pi Network passphrase
const NETWORK_PASSPHRASE = process.env.PI_NETWORK_PASSPHRASE || 'Pi Network';

// Map to store active monitoring tasks
const monitoringTasks = new Map();

// Map to store claiming tasks
const claimingTasks = new Map();

// Claimable balances storage
let claimableBalancesMap = new Map();

/**
 * Initialize wallet monitoring on server start
 */
export const initWalletMonitoring = async () => {
  // Future enhancement: load wallets from database
  addLog({
    message: 'Initializing wallet monitoring service',
    status: 'info'
  });
  
  // Set up periodic check task (every 2 minutes)
  cron.schedule('*/2 * * * *', checkAllWallets);
};

/**
 * Start monitoring a wallet
 * @param {Object} wallet - The wallet to monitor
 */
export const startMonitoring = async (wallet) => {
  try {
    // Log the start of monitoring
    addLog({
      message: `Starting monitoring for wallet: ${wallet.address.substring(0, 6)}...`,
      status: 'info',
      walletId: wallet.id
    });
    
    // Immediately check for claimable balances
    await checkWalletClaimableBalances(wallet);
    
    // Create a task for this wallet and store it in the map
    const task = cron.schedule('*/5 * * * *', async () => {
      await checkWalletClaimableBalances(wallet);
    });
    
    monitoringTasks.set(wallet.id, task);
    
    addLog({
      message: `Wallet monitoring active: ${wallet.address.substring(0, 6)}...`,
      status: 'success',
      walletId: wallet.id
    });
  } catch (error) {
    logError('Error starting wallet monitoring', error, wallet.id);
  }
};

/**
 * Stop monitoring a wallet
 * @param {string} walletId - The wallet ID to stop monitoring
 */
export const stopMonitoring = async (walletId) => {
  try {
    // Stop the task if it exists
    const task = monitoringTasks.get(walletId);
    if (task) {
      task.stop();
      monitoringTasks.delete(walletId);
      
      // Also stop any active claiming tasks
      const claimTask = claimingTasks.get(walletId);
      if (claimTask) {
        clearTimeout(claimTask);
        claimingTasks.delete(walletId);
      }
      
      addLog({
        message: 'Wallet monitoring stopped',
        status: 'info',
        walletId
      });
    }
  } catch (error) {
    logError('Error stopping wallet monitoring', error, walletId);
  }
};

/**
 * Check claimable balances for all wallets
 */
const checkAllWallets = async () => {
  // Get all wallet IDs from the monitoring tasks
  const walletIds = Array.from(monitoringTasks.keys());
  
  addLog({
    message: `Checking claimable balances for ${walletIds.length} wallets`,
    status: 'info'
  });
  
  // Check each wallet
  for (const walletId of walletIds) {
    try {
      const wallet = getWalletWithPrivateKey(walletId);
      if (wallet) {
        await checkWalletClaimableBalances(wallet);
      }
    } catch (error) {
      logError('Error checking wallet', error, walletId);
    }
  }
};

/**
 * Check claimable balances for a specific wallet
 * @param {Object} wallet - The wallet to check
 */
const checkWalletClaimableBalances = async (wallet) => {
  try {
    addLog({
      message: `Checking claimable balances for wallet: ${wallet.address.substring(0, 6)}...`,
      status: 'info',
      walletId: wallet.id
    });
    
    // Fetch claimable balances
    const balances = await fetchClaimableBalances(wallet.address);
    
    if (!balances._embedded || !balances._embedded.records) {
      addLog({
        message: `No claimable balances data for wallet: ${wallet.address.substring(0, 6)}...`,
        status: 'info',
        walletId: wallet.id
      });
      return;
    }
    
    const records = balances._embedded.records;
    
    if (records.length === 0) {
      addLog({
        message: `No claimable balances found for wallet: ${wallet.address.substring(0, 6)}...`,
        status: 'info',
        walletId: wallet.id
      });
      return;
    }
    
    addLog({
      message: `Found ${records.length} claimable balance(s) for wallet: ${wallet.address.substring(0, 6)}...`,
      status: 'success',
      walletId: wallet.id
    });
    
    // Process each claimable balance
    for (const record of records) {
      const id = record.id;
      const amount = record.amount;
      
      // Get unlock time
      const unlockTime = extractUnlockTime(record);
      
      // Create claimable balance object
      const claimableBalance = {
        id,
        amount,
        unlockTime,
        walletId: wallet.id
      };
      
      // Add to map if not already there
      if (!claimableBalancesMap.has(id)) {
        claimableBalancesMap.set(id, claimableBalance);
        
        addLog({
          message: `New claimable balance found: ${amount} Pi, unlocks ${unlockTime.toLocaleString()}`,
          status: 'info',
          walletId: wallet.id
        });
        
        // Schedule claiming when unlocked
        scheduleBalanceClaiming(claimableBalance, wallet);
      }
    }
  } catch (error) {
    logError('Error checking claimable balances', error, wallet.id);
  }
};

/**
 * Schedule claiming of a balance when it's unlocked
 * @param {Object} balance - The claimable balance
 * @param {Object} wallet - The wallet
 */
const scheduleBalanceClaiming = (balance, wallet) => {
  try {
    const now = new Date();
    const unlockTime = new Date(balance.unlockTime);
    const timeUntilUnlock = unlockTime.getTime() - now.getTime();
    
    // If already unlocked, claim now
    if (timeUntilUnlock <= 0) {
      addLog({
        message: `Balance of ${balance.amount} Pi is already unlocked, claiming immediately`,
        status: 'info',
        walletId: wallet.id
      });
      
      // Claim immediately
      processClaimableBalance(balance, wallet);
      return;
    }
    
    // Otherwise, schedule for later
    addLog({
      message: `Scheduled claim for ${balance.amount} Pi in ${formatTimeRemaining(timeUntilUnlock)}`,
      status: 'info',
      walletId: wallet.id
    });
    
    // Add a small buffer (5 seconds) after unlock time
    const taskId = setTimeout(() => {
      processClaimableBalance(balance, wallet);
    }, timeUntilUnlock + 5000);
    
    // Store task with balance ID for later cancellation if needed
    claimingTasks.set(balance.id, taskId);
    
  } catch (error) {
    logError('Error scheduling balance claiming', error, wallet.id);
  }
};

/**
 * Process a claimable balance (claim and transfer)
 * @param {Object} balance - The claimable balance
 * @param {Object} wallet - The wallet
 */
const processClaimableBalance = async (balance, wallet) => {
  try {
    addLog({
      message: `Processing claimable balance of ${balance.amount} Pi`,
      status: 'info',
      walletId: wallet.id
    });
    
    // Fetch sequence number
    addLog({
      message: `Fetching sequence number for wallet ${wallet.address.substring(0, 6)}...`,
      status: 'info',
      walletId: wallet.id
    });
    
    const currentSequence = await fetchSequenceNumber(wallet.address);
    
    addLog({
      message: `Building transaction for ${balance.amount} Pi`,
      status: 'info',
      walletId: wallet.id
    });
    
    // Validate private key
    const cleanPrivateKey = wallet.privateKey.trim();
    let keyPair;
    
    try {
      keyPair = StellarSdk.Keypair.fromSecret(cleanPrivateKey);
      
      // Verify keypair matches wallet address
      if (keyPair.publicKey() !== wallet.address) {
        throw new Error('Private key does not match wallet address');
      }
    } catch (error) {
      logError('Invalid private key', error, wallet.id);
      return;
    }
    
    // Create source account
    const sourceAccount = new StellarSdk.Account(wallet.address, currentSequence.toString());
    
    // Create transaction with high fee for priority
    let transactionBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: "1000000", // 0.1 Pi fee
      networkPassphrase: NETWORK_PASSPHRASE
    });
    
    // Add claim operation
    transactionBuilder = transactionBuilder.addOperation(
      StellarSdk.Operation.claimClaimableBalance({
        balanceId: balance.id
      })
    );
    
    // Add payment operation to transfer funds
    transactionBuilder = transactionBuilder.addOperation(
      StellarSdk.Operation.payment({
        destination: wallet.destinationAddress,
        asset: StellarSdk.Asset.native(),
        amount: balance.amount
      })
    );
    
    // Set timeout
    transactionBuilder = transactionBuilder.setTimeout(120);
    
    // Build transaction
    const transaction = transactionBuilder.build();
    
    // Sign transaction
    addLog({
      message: `Signing transaction...`,
      status: 'info',
      walletId: wallet.id
    });
    
    transaction.sign(keyPair);
    
    // Convert to XDR
    const xdr = transaction.toXDR();
    
    // Submit transaction
    addLog({
      message: `Submitting transaction to network...`,
      status: 'info',
      walletId: wallet.id
    });
    
    const result = await submitTransaction(xdr);
    
    // Check result
    if (result.successful) {
      addLog({
        message: `Transaction successful! Claimed and transferred ${balance.amount} Pi. Hash: ${result.hash}`,
        status: 'success',
        walletId: wallet.id
      });
      
      // Remove balance from map
      claimableBalancesMap.delete(balance.id);
      
      // Remove any scheduled task
      const taskId = claimingTasks.get(balance.id);
      if (taskId) {
        clearTimeout(taskId);
        claimingTasks.delete(balance.id);
      }
    } else {
      // Log error details
      if (result.extras && result.extras.result_codes) {
        const errorCodes = JSON.stringify(result.extras.result_codes);
        throw new Error(`Transaction failed with codes: ${errorCodes}`);
      } else {
        throw new Error('Transaction submission was not successful');
      }
    }
  } catch (error) {
    logError('Error processing claimable balance', error, wallet.id);
    
    // If it's a sequence number error, retry later
    if (error.message.includes('tx_bad_seq') || error.message.includes('sequence')) {
      addLog({
        message: 'Sequence number issue detected, will retry in 30 seconds',
        status: 'warning',
        walletId: wallet.id
      });
      
      // Schedule retry
      setTimeout(() => {
        processClaimableBalance(balance, wallet);
      }, 30000);
    } else {
      // Otherwise, retry in 2 minutes
      addLog({
        message: 'Transaction failed, will retry in 2 minutes',
        status: 'warning',
        walletId: wallet.id
      });
      
      setTimeout(() => {
        processClaimableBalance(balance, wallet);
      }, 120000);
    }
  }
};

/**
 * Extract unlock time from claimant predicate
 * @param {Object} record - The claimable balance record
 * @returns {Date} The unlock time
 */
const extractUnlockTime = (record) => {
  // Check if we have claimants
  if (!record.claimants || record.claimants.length === 0) {
    return new Date(Date.now() + 1000 * 60 * 60 * 24); // Default to 24 hours from now if no claimants
  }

  try {
    // Look for our wallet's claimant (usually first one)
    const claimant = record.claimants[0];
    
    // If it has a "not" predicate (meaning it can only be claimed after a certain time)
    if (claimant.predicate?.not?.abs_before) {
      return new Date(claimant.predicate.not.abs_before);
    }
    
    // If there's a second claimant with a "not" predicate, check that as well
    if (record.claimants.length > 1 && record.claimants[1].predicate?.not?.abs_before) {
      return new Date(record.claimants[1].predicate.not.abs_before);
    }
    
    // Default fallback if we can't determine
    return new Date(Date.now() + 1000 * 60 * 60 * 24); // Default to 24 hours from now
  } catch (error) {
    console.error("Error extracting unlock time:", error);
    return new Date(Date.now() + 1000 * 60 * 60 * 24); // Default to 24 hours from now on error
  }
};

/**
 * Format time remaining in human-readable format
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} Formatted time string
 */
const formatTimeRemaining = (milliseconds) => {
  if (milliseconds < 0) return 'now';
  
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours}h ${remainingMinutes}m`;
};

/**
 * Get all claimable balances
 * @returns {Array} Array of claimable balances
 */
export const getAllClaimableBalances = () => {
  return Array.from(claimableBalancesMap.values());
};

/**
 * Get claimable balances for a specific wallet
 * @param {string} walletId - The wallet ID
 * @returns {Array} Array of claimable balances for the wallet
 */
export const getWalletClaimableBalances = (walletId) => {
  return Array.from(claimableBalancesMap.values())
    .filter(balance => balance.walletId === walletId);
};

/**
 * Remove a claimable balance
 * @param {string} balanceId - The balance ID to remove
 */
export const removeClaimableBalance = (balanceId) => {
  // Cancel any scheduled claiming task
  const taskId = claimingTasks.get(balanceId);
  if (taskId) {
    clearTimeout(taskId);
    claimingTasks.delete(balanceId);
  }
  
  // Remove from map
  claimableBalancesMap.delete(balanceId);
};
