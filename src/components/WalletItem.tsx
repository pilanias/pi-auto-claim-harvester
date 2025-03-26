import React from 'react';
import { WalletData, ClaimableBalance, TransactionStatus } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import StatusIndicator from './StatusIndicator';
import BalanceTimer from './BalanceTimer';
import { Wallet, ArrowRight, Coins, Trash2, PlayCircle } from 'lucide-react';

interface WalletItemProps {
  wallet: WalletData;
  claimableBalances: ClaimableBalance[];
  processingStatuses: Record<string, TransactionStatus>;
  onRemove: (walletId: string) => void;
  onForceProcess?: (balance: ClaimableBalance) => void;
  maskAddress: (address: string) => string;
}

const WalletItem: React.FC<WalletItemProps> = ({
  wallet,
  claimableBalances,
  processingStatuses,
  onRemove,
  onForceProcess,
  maskAddress
}) => {
  // Filter balances for this wallet
  const walletBalances = claimableBalances.filter(
    balance => balance.walletId === wallet.id
  );
  
  // Calculate total Pi amount
  const totalPi = walletBalances.reduce(
    (total, balance) => total + parseFloat(balance.amount),
    0
  );

  const isBalanceUnlocked = (unlockTime: Date) => {
    return new Date() >= new Date(unlockTime);
  };

  return (
    <Card className="overflow-hidden glass-morphism hover:shadow-md transition-shadow duration-300 animate-fade-in">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">{maskAddress(wallet.address)}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(wallet.id)}
            className="h-8 w-8 p-0 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center text-sm text-muted-foreground mb-3">
          <ArrowRight className="w-3.5 h-3.5 mr-1" />
          <span className="truncate">{maskAddress(wallet.destinationAddress)}</span>
        </div>
        
        {walletBalances.length > 0 ? (
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between text-sm border-t pt-2">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Coins className="w-3.5 h-3.5" />
                <span>Total pending:</span>
              </div>
              <span className="font-medium">{totalPi.toFixed(2)} Pi</span>
            </div>
            
            {walletBalances.map((balance) => {
              const isUnlocked = isBalanceUnlocked(balance.unlockTime);
              const status = processingStatuses[balance.id] || 'idle';
              const isProcessing = status !== 'idle' && status !== 'failed';
              
              return (
                <div 
                  key={balance.id} 
                  className={`rounded-md px-3 py-2 text-xs border
                    ${isUnlocked ? 'bg-primary/5 border-primary/20' : 
                      'bg-secondary/50 border-border'}
                  `}
                >
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="font-medium">{parseFloat(balance.amount).toFixed(7)} Pi</span>
                  </div>
                  
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-muted-foreground">Unlock:</span>
                    <BalanceTimer 
                      unlockTime={balance.unlockTime}
                      className="justify-end"
                    />
                  </div>
                  
                  <div className="flex justify-between items-center mt-2 pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">Status:</span>
                    <div className="flex items-center gap-2">
                      <StatusIndicator status={status} />
                      
                      {isUnlocked && status === 'idle' && onForceProcess && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded-full"
                          onClick={() => onForceProcess(balance)}
                          title="Force process"
                        >
                          <PlayCircle className="h-4 w-4 text-green-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 p-3 rounded-md border border-dashed text-center text-muted-foreground text-xs">
            No claimable balances found for this wallet
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WalletItem;
