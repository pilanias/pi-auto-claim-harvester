
import React, { useEffect } from 'react';
import { useWalletManager } from '@/hooks/useWalletManager';
import { useClaimableBalances } from '@/hooks/useClaimableBalances';
import { useTransaction } from '@/hooks/useTransaction';
import WalletForm from '@/components/WalletForm';
import WalletList from '@/components/WalletList';
import LogDisplay from '@/components/LogDisplay';
import { RefreshCw, Coins, Wallet, GitFork } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const Index = () => {
  // Initialize hooks
  const { wallets, logs, addWallet, removeWallet, addLog, clearLogs, maskAddress } = useWalletManager();
  
  const {
    claimableBalances,
    isLoading,
    lastUpdate,
    fetchAllBalances,
    removeBalance,
    toggleAutoRefresh,
    refreshEnabled
  } = useClaimableBalances(wallets, addLog);
  
  const {
    processingBalances,
    formatTimeRemaining
  } = useTransaction(wallets, claimableBalances, removeBalance, addLog);

  // Calculate total Pi pending
  const totalPending = claimableBalances.reduce(
    (total, balance) => total + parseFloat(balance.amount),
    0
  );

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
  }, []);

  const handleRefresh = () => {
    fetchAllBalances();
    addLog({
      message: 'Manually refreshed claimable balances',
      status: 'info'
    });
  };

  // Update the wrapper function to accept the Promise from addWallet
  const handleAddWallet = async (walletData: {
    address: string;
    privateKey: string;
    destinationAddress: string;
  }) => {
    try {
      await addWallet(walletData);
      return true; // Return a boolean as expected by WalletForm
    } catch (error) {
      console.error('Error in handleAddWallet:', error);
      return false; // Return a boolean as expected by WalletForm
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
            processingStatuses={processingBalances}
            formatTimeRemaining={formatTimeRemaining}
            onRemoveWallet={removeWallet}
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
