
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { WalletData, LogEntry } from '@/lib/types';
import { toast } from 'sonner';
import { 
  monitorWallet, 
  stopMonitoringWallet, 
  getMonitoredWallets, 
  getLogs, 
  clearLogs as clearLogsApi 
} from '@/lib/api';

export function useWalletManager() {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load wallets and logs from backend on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Get wallets from backend
        const backendWallets = await getMonitoredWallets();
        setWallets(backendWallets);
        
        // Get logs from backend
        const backendLogs = await getLogs();
        setLogs(backendLogs);
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Error loading initial data:', error);
        toast.error('Failed to connect to backend service');
        // Initialize with empty arrays if backend is not available
        setWallets([]);
        setLogs([]);
        setIsInitialized(true);
      }
    };
    
    fetchInitialData();
  }, []);

  // Add a new wallet
  const addWallet = useCallback(async (walletData: Omit<WalletData, 'id' | 'added'>) => {
    // Basic validation
    if (!walletData.address || !walletData.privateKey || !walletData.destinationAddress) {
      toast.error('All wallet fields are required');
      return false;
    }
    
    // Check if wallet already exists
    if (wallets.some(w => w.address === walletData.address)) {
      toast.error('This wallet address is already being tracked');
      return false;
    }

    try {
      // Send wallet to backend for monitoring
      const response = await monitorWallet(walletData);
      
      // Backend returns the created wallet with ID
      const newWallet = response.wallet;
      
      setWallets(prev => [...prev, newWallet]);
      
      toast.success('Wallet added successfully');
      return true;
    } catch (error) {
      console.error('Error adding wallet:', error);
      toast.error(`Failed to add wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }, [wallets]);

  // Remove a wallet
  const removeWallet = useCallback(async (walletId: string) => {
    try {
      // Tell backend to stop monitoring this wallet
      await stopMonitoringWallet(walletId);
      
      setWallets(prev => {
        const walletToRemove = prev.find(w => w.id === walletId);
        if (!walletToRemove) return prev;
        
        toast.success('Wallet removed');
        return prev.filter(w => w.id !== walletId);
      });
    } catch (error) {
      console.error('Error removing wallet:', error);
      toast.error(`Failed to remove wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  // Add a log entry (client-side only, for immediate feedback)
  const addLog = useCallback((logData: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newLog: LogEntry = {
      ...logData,
      id: uuidv4(),
      timestamp: new Date()
    };

    setLogs(prev => [...prev, newLog]);
    return newLog;
  }, []);

  // Clear all logs
  const clearLogs = useCallback(async () => {
    try {
      // Clear logs on backend
      await clearLogsApi();
      
      // Clear logs locally
      setLogs([]);
      
      // Add a new log entry
      addLog({
        message: 'Logs cleared',
        status: 'info'
      });
      
      toast.success('Logs cleared');
    } catch (error) {
      console.error('Error clearing logs:', error);
      toast.error(`Failed to clear logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [addLog]);

  // Helper function to mask wallet addresses for privacy
  const maskAddress = (address: string): string => {
    if (address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Periodically sync logs and wallets from backend
  useEffect(() => {
    if (!isInitialized) return;

    const syncInterval = setInterval(async () => {
      try {
        const backendLogs = await getLogs();
        setLogs(backendLogs);
        
        const backendWallets = await getMonitoredWallets();
        setWallets(backendWallets);
      } catch (error) {
        console.error('Error syncing with backend:', error);
        // Don't show toast as this is a background operation
      }
    }, 300000); // Sync every 10 seconds
    
    return () => clearInterval(syncInterval);
  }, [isInitialized]);

  return {
    wallets,
    logs,
    addWallet,
    removeWallet,
    addLog,
    clearLogs,
    maskAddress
  };
}
