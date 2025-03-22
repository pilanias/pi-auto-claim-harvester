
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { WalletData, LogEntry } from '@/lib/types';
import { saveWallets, loadWallets, saveLogs, loadLogs } from '@/lib/storage';
import { toast } from 'sonner';
import * as StellarSdk from 'stellar-sdk';

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
  const addWallet = useCallback((walletData: Omit<WalletData, 'id' | 'added'>) => {
    // Basic validation
    if (!walletData.address || !walletData.privateKey || !walletData.destinationAddress) {
      toast.error('All wallet fields are required');
      return false;
    }
    
    // Validate wallet address format
    try {
      // Attempt to parse the address (will throw if invalid)
      StellarSdk.StrKey.decodeEd25519PublicKey(walletData.address);
    } catch (e) {
      toast.error('Invalid wallet address format');
      return false;
    }
    
    // Validate private key format
    try {
      // Check if private key starts with 'S'
      if (!walletData.privateKey.startsWith('S')) {
        toast.error('Invalid private key format. Must start with "S"');
        return false;
      }
      
      // Attempt to parse the private key (will throw if invalid)
      StellarSdk.StrKey.decodeEd25519SecretSeed(walletData.privateKey);
    } catch (e) {
      toast.error('Invalid private key format');
      return false;
    }
    
    // Validate destination address format
    try {
      // Attempt to parse the address (will throw if invalid)
      StellarSdk.StrKey.decodeEd25519PublicKey(walletData.destinationAddress);
    } catch (e) {
      toast.error('Invalid destination address format');
      return false;
    }
    
    // Check if wallet already exists
    if (wallets.some(w => w.address === walletData.address)) {
      toast.error('This wallet address is already being tracked');
      return false;
    }

    // Validate that the private key corresponds to the public key
    try {
      const keyPair = StellarSdk.Keypair.fromSecret(walletData.privateKey);
      const derivedPublicKey = keyPair.publicKey();
      
      if (derivedPublicKey !== walletData.address) {
        toast.error('Private key does not match the provided wallet address');
        return false;
      }
    } catch (e) {
      toast.error('Error validating key pair');
      return false;
    }

    const newWallet: WalletData = {
      ...walletData,
      id: uuidv4(),
      added: new Date()
    };

    setWallets(prev => [...prev, newWallet]);
    
    addLog({
      message: `New wallet added: ${maskAddress(walletData.address)}`,
      status: 'success',
      walletId: newWallet.id
    });

    toast.success('Wallet added successfully');
    return true;
  }, [wallets]);

  // Remove a wallet
  const removeWallet = useCallback((walletId: string) => {
    setWallets(prev => {
      const walletToRemove = prev.find(w => w.id === walletId);
      if (!walletToRemove) return prev;
      
      addLog({
        message: `Wallet removed: ${maskAddress(walletToRemove.address)}`,
        status: 'info',
        walletId
      });
      
      toast.success('Wallet removed');
      return prev.filter(w => w.id !== walletId);
    });
  }, []);

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
