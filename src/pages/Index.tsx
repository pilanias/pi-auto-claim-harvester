
import React, { useEffect, useState } from 'react';
import { useWalletManager } from '@/hooks/useWalletManager';
import { useClaimableBalances } from '@/hooks/useClaimableBalances';
import WalletForm from '@/components/WalletForm';
import WalletList from '@/components/WalletList';
import LogDisplay from '@/components/LogDisplay';
import { RefreshCw, Coins, Wallet, GitFork, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';

const Index = () => {
  // Initialize hooks
  const { wallets, logs, addWallet, removeWallet, addLog, clearLogs, maskAddress } = useWalletManager();
  
  const {
    claimableBalances,
    isLoading,
    lastUpdate,
    fetchAllBalances,
    removeBalance
  } = useClaimableBalances(wallets, addLog);

  // Calculate total Pi pending
  const totalPending = claimableBalances.reduce(
    (total, balance) => total + parseFloat(balance.amount),
    0
  );

  // Log component mount
  useEffect(() => {
    addLog({
      message: 'Pi Auto-Claim Tool started',
      status: 'info'
    });
    
    // Add a note about the backend service
    addLog({
      message: 'Connected to backend service for continuous monitoring',
      status: 'info'
    });
    
    // Set page title
    document.title = 'Pi Auto-Claim Tool';
    
    // Return cleanup function
    return () => {
      addLog({
        message: 'UI closed, backend processing continues',
        status: 'info'
      });
    };
  }, []);

  const handleRefresh = () => {
    fetchAllBalances();
    addLog({
      message: 'Manually refreshed wallet statuses from backend',
      status: 'info'
    });
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
            Automatically monitor, claim, and transfer Pi when unlocked. Processing runs on a backend server for 24/7 operation.
          </p>
        </div>
        
        {/* Backend Service Alert */}
        <Alert className="mb-6 border-green-200 bg-green-50 text-green-800">
          <Server className="h-4 w-4 text-green-600" />
          <AlertDescription>
            All transaction processing happens on the backend server. You can close this browser and transactions will continue to process automatically.
          </AlertDescription>
        </Alert>
        
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
            
            <Separator className="hidden sm:inline-block h-4 w-px bg-muted" />
            
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-600 font-medium">
                Backend Processing Active
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
                  Refresh Status
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
          <WalletForm onAddWallet={addWallet} className="lg:col-span-1" />
          
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
            processingStatuses={{}} // Processing status now comes from backend
            formatTimeRemaining={(ms) => ms < 0 ? 'now' : `${Math.floor(ms/1000)}s`}
            onRemoveWallet={removeWallet}
            maskAddress={maskAddress}
          />
        </div>
        
        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p>Pi Auto-Claim Tool — <span className="text-green-600 font-medium">Transactions processed 24/7 on backend server</span></p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
