
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { WalletData, LogEntry } from '@/lib/types';
import { saveWallets, loadWallets, saveLogs, loadLogs } from '@/lib/storage';
import { toast } from 'sonner';
import { startWalletMonitoring, stopWalletMonitoring } from '@/lib/api';

export function useWalletManager() {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load wallets and logs from storage on mount
  useEffect(() => {
    const storedWallets = loadWallets();
    const storedLogs = loadLogs();
    
    setWallets(storedWallets);
    setLogs(storedLogs);
    setIsInitialized(true);
    
    // Add initial log if no logs exist
    if (storedLogs.length === 0) {
      addLog({
        message: 'Pi Auto-Claim Tool initialized',
        status: 'info'
      });
    }
  }, []);

  // Save wallets to storage whenever they change
  useEffect(() => {
    if (isInitialized) {
      saveWallets(wallets);
    }
  }, [wallets, isInitialized]);

  // Save logs to storage whenever they change
  useEffect(() => {
    if (isInitialized) {
      saveLogs(logs);
    }
  }, [logs, isInitialized]);

  // Add a new wallet
  const addWallet = useCallback(async (walletData: { address: string; privateKey: string; destinationAddress: string }) => {
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

    const newWallet: WalletData = {
      ...walletData,
      id: uuidv4(),
      added: new Date()
    };

    try {
      // Send the wallet data to the simulated backend for monitoring
      await startWalletMonitoring({
        address: walletData.address,
        privateKey: walletData.privateKey,
        destinationAddress: walletData.destinationAddress
      });
      
      // Only store address and destination in browser storage (no private key)
      const safeWallet = {
        ...newWallet,
        // Store an empty or masked private key string to maintain structure
        // but don't store the actual key in the browser
        privateKey: '***'
      };
      
      setWallets(prev => [...prev, safeWallet]);
      
      addLog({
        message: `New wallet added to backend monitoring: ${maskAddress(walletData.address)}`,
        status: 'success',
        walletId: newWallet.id
      });

      toast.success('Wallet added to backend monitoring');
      return true;
    } catch (error) {
      console.error("Error adding wallet to backend:", error);
      toast.error('Failed to add wallet to backend monitoring');
      return false;
    }
  }, [wallets]);

  // Remove a wallet
  const removeWallet = useCallback(async (walletId: string) => {
    try {
      const walletToRemove = wallets.find(w => w.id === walletId);
      if (!walletToRemove) return;
      
      // Tell the backend to stop monitoring this wallet
      await stopWalletMonitoring(walletId);
      
      setWallets(prev => {
        addLog({
          message: `Wallet removed from monitoring: ${maskAddress(walletToRemove.address)}`,
          status: 'info',
          walletId
        });
        
        toast.success('Wallet removed from monitoring');
        return prev.filter(w => w.id !== walletId);
      });
    } catch (error) {
      console.error("Error removing wallet from backend:", error);
      toast.error('Failed to remove wallet from backend monitoring');
    }
  }, [wallets]);

  // Add a log entry
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
  const clearLogs = useCallback(() => {
    setLogs([]);
    addLog({
      message: 'Logs cleared',
      status: 'info'
    });
    toast.success('Logs cleared');
  }, []);

  // Helper function to mask wallet addresses for privacy
  const maskAddress = (address: string): string => {
    if (address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

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
