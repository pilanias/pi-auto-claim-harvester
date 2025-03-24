import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { throttle } from '@/lib/performance';

// Constants to avoid magic numbers
const SYNC_INTERVAL = 900000; // 15 minutes (increased from 10 minutes)
const ERROR_THROTTLE_INTERVAL = 30000; // 30 seconds

export function useWalletManager() {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastSyncRef = useRef<number>(0);
  const isSyncingRef = useRef<boolean>(false);
  const lastErrorLogTimeRef = useRef<number>(0); // To throttle error logs
  const prevWalletsCountRef = useRef<number>(0); // To track wallet count changes

  // Throttled error logging function using the throttle utility
  const throttledErrorLog = useCallback(throttle((message: string, error: any) => {
    console.error(message, error);
  }, ERROR_THROTTLE_INTERVAL), []);

  // Load wallets and logs from backend on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Get wallets from backend
        const backendWallets = await getMonitoredWallets();
        setWallets(backendWallets);
        prevWalletsCountRef.current = backendWallets.length;
        
        // Get logs from backend
        const backendLogs = await getLogs();
        setLogs(backendLogs);
        
        setIsInitialized(true);
        lastSyncRef.current = Date.now();
      } catch (error) {
        throttledErrorLog('Error loading initial data:', error);
        toast.error('Failed to connect to backend service');
        // Initialize with empty arrays if backend is not available
        setWallets([]);
        setLogs([]);
        setIsInitialized(true);
      }
    };
    
    fetchInitialData();
  }, [throttledErrorLog]);

  // Add a new wallet - memoize wallets dependency
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
    // Limit logs array size to prevent memory issues
    const newLog: LogEntry = {
      ...logData,
      id: uuidv4(),
      timestamp: new Date()
    };

    setLogs(prev => {
      // Keep only the last 1000 logs to prevent memory bloat
      const updatedLogs = [...prev, newLog];
      if (updatedLogs.length > 1000) {
        return updatedLogs.slice(updatedLogs.length - 1000);
      }
      return updatedLogs;
    });
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
  const maskAddress = useMemo(() => {
    return (address: string): string => {
      if (address.length < 10) return address;
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    };
  }, []);

  // Sync from backend - optimized to reduce CPU usage
  const syncWithBackend = useCallback(async (force = false) => {
    // Skip if already syncing or if not initialized
    if (isSyncingRef.current || !isInitialized) return;
    
    // Check if enough time has passed since last sync (15 minutes now - INCREASED to reduce CPU)
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncRef.current;
    
    // Only sync if forced or if enough time has passed
    if (!force && timeSinceLastSync < SYNC_INTERVAL) return;
    
    isSyncingRef.current = true;
    
    try {
      const backendLogs = await getLogs();
      
      // Only update logs if there are new ones
      if (backendLogs.length !== logs.length) {
        setLogs(backendLogs);
      }
      
      const backendWallets = await getMonitoredWallets();
      
      // Only update wallets if the count changed
      if (backendWallets.length !== prevWalletsCountRef.current) {
        setWallets(backendWallets);
        prevWalletsCountRef.current = backendWallets.length;
      }
      
      // Update last sync time
      lastSyncRef.current = now;
    } catch (error) {
      throttledErrorLog('Error syncing with backend:', error);
      // Don't show toast as this is a background operation
    } finally {
      isSyncingRef.current = false;
    }
  }, [isInitialized, logs.length, throttledErrorLog]);

  // Periodically sync logs and wallets from backend, reduced frequency
  useEffect(() => {
    if (!isInitialized) return;

    // Initial sync - use a small timeout to avoid immediate execution
    const initialSyncTimeout = setTimeout(() => {
      syncWithBackend(true);
    }, 1000);
    
    // Reduce sync frequency to once every 15 minutes
    const syncInterval = setInterval(() => {
      syncWithBackend();
    }, SYNC_INTERVAL);
    
    return () => {
      clearTimeout(initialSyncTimeout);
      clearInterval(syncInterval);
    };
  }, [isInitialized, syncWithBackend]);

  // Use a stable reference for the return object to prevent unnecessary re-renders
  return useMemo(() => ({
    wallets,
    logs,
    addWallet,
    removeWallet,
    addLog,
    clearLogs,
    maskAddress,
    syncWithBackend
  }), [wallets, logs, addWallet, removeWallet, addLog, clearLogs, maskAddress, syncWithBackend]);
}
