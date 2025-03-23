
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Maximum number of logs to store
const MAX_LOGS = parseInt(process.env.MAX_LOGS || '500', 10);

// In-memory storage for logs
let logs = [];

/**
 * Add a new log entry
 * @param {Object} logData - The log data
 * @param {string} logData.message - The log message
 * @param {string} logData.status - The log status (info, success, warning, error)
 * @param {string} [logData.walletId] - The associated wallet ID (optional)
 * @returns {Object} The created log entry
 */
export const addLog = (logData) => {
  const newLog = {
    id: uuidv4(),
    timestamp: new Date(),
    message: logData.message,
    status: logData.status || 'info',
    walletId: logData.walletId
  };
  
  // Add to beginning for chronological order
  logs.unshift(newLog);
  
  // Trim logs if exceeding max
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(0, MAX_LOGS);
  }
  
  // Log to console as well
  console.log(`[${newLog.status.toUpperCase()}] ${newLog.message}${newLog.walletId ? ` (Wallet: ${newLog.walletId})` : ''}`);
  
  return newLog;
};

/**
 * Get all logs
 * @returns {Array} Array of log entries
 */
export const getLogs = () => {
  return logs;
};

/**
 * Clear all logs
 * @returns {boolean} Success status
 */
export const clearLogs = () => {
  logs = [];
  
  // Add a new "logs cleared" entry
  addLog({
    message: 'Logs cleared',
    status: 'info'
  });
  
  return true;
};

/**
 * Get logs for a specific wallet
 * @param {string} walletId - The wallet ID
 * @returns {Array} Array of log entries for the wallet
 */
export const getWalletLogs = (walletId) => {
  return logs.filter(log => log.walletId === walletId);
};

/**
 * Add an error log and console.error
 * @param {string} message - The error message
 * @param {Error} error - The error object
 * @param {string} [walletId] - Optional wallet ID
 */
export const logError = (message, error, walletId) => {
  const errorMessage = `${message}: ${error.message || 'Unknown error'}`;
  console.error(errorMessage, error);
  
  addLog({
    message: errorMessage,
    status: 'error',
    walletId
  });
};
