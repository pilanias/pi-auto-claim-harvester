
import React from 'react';
import { WalletData, ClaimableBalance, TransactionStatus } from '@/lib/types';
import WalletItem from './WalletItem';
import { ScrollArea } from '@/components/ui/scroll-area';

interface WalletListProps {
  wallets: WalletData[];
  claimableBalances: ClaimableBalance[];
  processingStatuses: Record<string, TransactionStatus>;
  onRemoveWallet: (walletId: string) => void;
  maskAddress: (address: string) => string;
  onForceClaimNow?: (balanceId: string) => void;
  isNearUnlock?: (balance: ClaimableBalance) => boolean;
  isUnlocked?: (balance: ClaimableBalance) => boolean;
}

const WalletList: React.FC<WalletListProps> = ({
  wallets,
  claimableBalances,
  processingStatuses,
  onRemoveWallet,
  maskAddress,
  onForceClaimNow,
  isNearUnlock,
  isUnlocked
}) => {
  if (wallets.length === 0) {
    return (
      <div className="p-6 text-center border border-dashed rounded-lg">
        <p className="text-muted-foreground">No wallets added yet. Add a wallet to start monitoring.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScrollArea className="h-auto max-h-[80vh]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
          {wallets.map((wallet) => (
            <WalletItem
              key={wallet.id}
              wallet={wallet}
              claimableBalances={claimableBalances.filter(b => b.walletId === wallet.id)}
              processingStatuses={processingStatuses}
              onRemove={onRemoveWallet}
              maskAddress={maskAddress}
              onForceClaimNow={onForceClaimNow}
              isNearUnlock={isNearUnlock}
              isUnlocked={isUnlocked}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default WalletList;
