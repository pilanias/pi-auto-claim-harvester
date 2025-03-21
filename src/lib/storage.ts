import { WalletData, LogEntry } from './types';

// Local storage keys
const WALLETS_STORAGE_KEY = 'pi-auto-claim-wallets';
const LOGS_STORAGE_KEY = 'pi-auto-claim-logs';

// Wallet Storage
export const saveWallets = (wallets: WalletData[]): void => {
  try {
    const dataToSave = wallets.map(wallet => ({
      ...wallet,
      added: wallet.added.toISOString(),
    }));
    localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(dataToSave));
  } catch (error) {
    console.error('Error saving wallets to storage:', error);
  }
};

export const loadWallets = (): WalletData[] => {
  try {
    const storedData = localStorage.getItem(WALLETS_STORAGE_KEY);
    if (!storedData) return [];
    
    const parsedData = JSON.parse(storedData);
    return parsedData.map((wallet: any) => ({
      ...wallet,
      added: new Date(wallet.added),
    }));
  } catch (error) {
    console.error('Error loading wallets from storage:', error);
    return [];
  }
};

// Logs Storage
export const saveLogs = (logs: LogEntry[]): void => {
  try {
    // Only keep the most recent 500 logs
    const logsToSave = logs.slice(-500).map(log => ({
      ...log,
      timestamp: log.timestamp.toISOString(),
    }));
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logsToSave));
  } catch (error) {
    console.error('Error saving logs to storage:', error);
  }
};

export const loadLogs = (): LogEntry[] => {
  try {
    const storedData = localStorage.getItem(LOGS_STORAGE_KEY);
    if (!storedData) return [];
    
    const parsedData = JSON.parse(storedData);
    return parsedData.map((log: any) => ({
      ...log,
      timestamp: new Date(log.timestamp),
    }));
  } catch (error) {
    console.error('Error loading logs from storage:', error);
    return [];
  }
};

// Clear all storage
export const clearAllData = (): void => {
  try {
    localStorage.removeItem(WALLETS_STORAGE_KEY);
    localStorage.removeItem(LOGS_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing storage:', error);
  }
};
