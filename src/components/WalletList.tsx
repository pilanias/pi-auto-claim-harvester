
import React from 'react';
import { WalletData, ClaimableBalance, TransactionStatus } from '@/lib/types';
import WalletItem from './WalletItem';

interface WalletListProps {
  wallets: WalletData[];
  claimableBalances: ClaimableBalance[];
  processingStatuses: Record<string, TransactionStatus>;
  onRemoveWallet: (walletId: string) => void | Promise<void>;
  onForceProcess?: (balance: ClaimableBalance) => void;
  maskAddress: (address: string) => string;
}

const WalletList: React.FC<WalletListProps> = ({
  wallets,
  claimableBalances,
  processingStatuses,
  onRemoveWallet,
  onForceProcess,
  maskAddress
}) => {
  if (wallets.length === 0) {
    return (
      <div className="text-center p-8 border border-dashed rounded-lg bg-muted/30">
        <p className="text-muted-foreground">No wallets added yet. Add a wallet to start monitoring.</p>
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {wallets.map((wallet) => (
        <WalletItem
          key={wallet.id}
          wallet={wallet}
          claimableBalances={claimableBalances.filter(b => b.walletId === wallet.id)}
          processingStatuses={processingStatuses}
          onRemove={onRemoveWallet}
          onForceProcess={onForceProcess}
          maskAddress={maskAddress}
        />
      ))}
    </div>
  );
};

export default WalletList;
