
import React, { useEffect, useState, useCallback } from 'react';
import { useWalletManager } from '@/hooks/useWalletManager';
import WalletForm from '@/components/WalletForm';
import WalletList from '@/components/WalletList';
import LogDisplay from '@/components/LogDisplay';
import { RefreshCw, Coins, Wallet, GitFork } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ClaimableBalance, TransactionStatus } from '@/lib/types';
import { toast } from 'sonner';
import { fetchClaimableBalances } from '@/lib/api';

const Index = () => {
  // Get wallet management functionality from hook
  const { wallets, logs, addWallet, removeWallet, addLog, clearLogs, maskAddress } = useWalletManager();
  
  // Local state for UI
  const [claimableBalances, setClaimableBalances] = useState<ClaimableBalance[]>([]);
  const [processingStatuses, setProcessingStatuses] = useState<Record<string, TransactionStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Calculate total Pi pending
  const totalPending = claimableBalances.reduce(
    (total, balance) => total + parseFloat(balance.amount),
    0
  );

  // Fetch all balances from the backend
  const fetchAllBalances = useCallback(async (showToast = false) => {
    setIsLoading(true);
    
    try {
      let allBalances: ClaimableBalance[] = [];
      
      // Fetch balances for each wallet in parallel
      const promises = wallets.map(async (wallet) => {
        try {
          const response = await fetchClaimableBalances(wallet.address);
          
          // Handle API response properly
          if (response && response._embedded && Array.isArray(response._embedded.records)) {
            // Map the records to our ClaimableBalance format
            return response._embedded.records.map((record: any) => {
              // Extract unlock time using the same logic as in backend
              const unlockTime = extractUnlockTime(record);
              
              return {
                id: record.id,
                amount: record.amount,
                unlockTime,
                walletId: wallet.id,
                lastChecked: new Date()
              };
            });
          }
          
          // If we get an invalid response, log it and return empty array
          console.log('Invalid response from API for wallet', wallet.address, response);
          return [];
        } catch (error) {
          console.error(`Error fetching balances for wallet ${wallet.address}:`, error);
          return [];
        }
      });
      
      const results = await Promise.all(promises);
      allBalances = results.flat();
      
      setClaimableBalances(allBalances);
      setLastUpdate(new Date());
      
      if (showToast) {
        toast.success("Balances refreshed successfully");
      }
      
      addLog({
        message: `Fetched ${allBalances.length} claimable balances across ${wallets.length} wallets`,
        status: 'info'
      });
    } catch (error) {
      console.error("Error fetching all balances:", error);
      
      if (showToast) {
        toast.error("Failed to refresh balances");
      }
      
      addLog({
        message: `Failed to fetch balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  }, [wallets, addLog]);

  // Helper function to extract unlock time
  const extractUnlockTime = (record: any): Date => {
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

  // Fetch balances initially and on wallet changes
  useEffect(() => {
    if (wallets.length > 0) {
      fetchAllBalances();
    }
  }, [wallets, fetchAllBalances]);

  // Periodically refresh balances (every 5 minutes)
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (wallets.length > 0) {
        fetchAllBalances();
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    return () => clearInterval(refreshInterval);
  }, [wallets, fetchAllBalances]);

  // Log component mount
  useEffect(() => {
    addLog({
      message: 'Pi Auto-Claim Tool frontend started',
      status: 'info'
    });
    
    // Set page title
    document.title = 'Pi Auto-Claim Tool';
    
    // Return cleanup function
    return () => {
      addLog({
        message: 'Frontend UI closed, background processes will continue on server',
        status: 'info'
      });
    };
  }, [addLog]);

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    fetchAllBalances(true); // Force refresh with toast
  }, [fetchAllBalances]);

  // Request the backend to force process a balance
  const handleForceProcess = useCallback(async (balance: ClaimableBalance) => {
    try {
      // Update local status immediately for UI feedback
      setProcessingStatuses(prev => ({
        ...prev,
        [balance.id]: 'submitting'
      }));
      
      // Call backend API to force process (you need to implement this endpoint)
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/force-process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ balanceId: balance.id, walletId: balance.walletId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to force process balance');
      }
      
      toast.success('Balance is being processed by the server');
      
      addLog({
        message: `Manually triggered processing for balance ${balance.id}`,
        status: 'info',
        walletId: balance.walletId
      });
      
      // Refresh balances after a short delay
      setTimeout(() => fetchAllBalances(), 2000);
    } catch (error) {
      console.error('Error forcing process:', error);
      toast.error('Failed to process balance');
      
      // Reset status on error
      setProcessingStatuses(prev => ({
        ...prev,
        [balance.id]: 'failed'
      }));
      
      addLog({
        message: `Failed to force process: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error',
        walletId: balance.walletId
      });
    }
  }, [addLog, fetchAllBalances]);

  // Ensure we handle the addWallet Promise properly by wrapping it
  const handleAddWallet = async (walletData: { address: string; privateKey: string; destinationAddress: string; }) => {
    try {
      const result = await addWallet(walletData);
      return result;
    } catch (error) {
      console.error("Error adding wallet:", error);
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 bg-grid px-4 py-8 md:py-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center animate-fade-in">
          <div className="inline-flex items-center justify-center p-2 mb-2 bg-primary/10 rounded-full">
            <Coins className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-medium mb-2 tracking-tight">Pi Auto-Claim Tool</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Automatically monitor, claim, and transfer Pi when unlocked. The tool runs continuously on a backend server even when this UI is closed.
          </p>
        </div>
        
        {/* Status Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 mb-8 glass-morphism rounded-lg animate-fade-in">
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-4 sm:mb-0">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                {wallets.length} {wallets.length === 1 ? 'Wallet' : 'Wallets'}
              </span>
            </div>
            
            <Separator className="hidden sm:inline-block h-4 w-px bg-muted" />
            
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-medium">{totalPending.toFixed(2)} Pi</span> pending
              </span>
            </div>
            
            <Separator className="hidden sm:inline-block h-4 w-px bg-muted" />
            
            <div className="flex items-center gap-2">
              <GitFork className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                {claimableBalances.length} {claimableBalances.length === 1 ? 'Transaction' : 'Transactions'} pending
              </span>
            </div>
          </div>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Last update: {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : 'Never'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Wallet Form */}
          <WalletForm onAddWallet={handleAddWallet} className="lg:col-span-1" />
          
          {/* Logs */}
          <LogDisplay 
            logs={logs} 
            onClearLogs={clearLogs} 
            className="lg:col-span-2" 
          />
        </div>
        
        {/* Wallet List */}
        <div className="animate-slide-up">
          <h2 className="text-xl font-medium mb-4">Monitored Wallets</h2>
          <WalletList
            wallets={wallets}
            claimableBalances={claimableBalances}
            processingStatuses={processingStatuses}
            onRemoveWallet={removeWallet}
            onForceProcess={handleForceProcess}
            maskAddress={maskAddress}
          />
        </div>
        
        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p>Pi Auto-Claim Tool — Backend server continues processing even when this UI is closed.</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
