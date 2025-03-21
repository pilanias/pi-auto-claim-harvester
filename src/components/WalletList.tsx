
import React from 'react';
import { WalletData, ClaimableBalance, TransactionStatus } from '@/lib/types';
import WalletItem from './WalletItem';

interface WalletListProps {
  wallets: WalletData[];
  claimableBalances: ClaimableBalance[];
  processingStatuses: Record<string, TransactionStatus>;
  formatTimeRemaining: (milliseconds: number) => string;
  onRemoveWallet: (walletId: string) => void;
  maskAddress: (address: string) => string;
  className?: string;
}

const WalletList: React.FC<WalletListProps> = ({
  wallets,
  claimableBalances,
  processingStatuses,
  formatTimeRemaining,
  onRemoveWallet,
  maskAddress,
  className = ''
}) => {
  if (wallets.length === 0) {
    return (
      <div className={`p-8 text-center text-muted-foreground ${className}`}>
        <p>No wallets added yet. Add a wallet to start monitoring for claimable balances.</p>
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${className}`}>
      {wallets.map(wallet => (
        <WalletItem
          key={wallet.id}
          wallet={wallet}
          claimableBalances={claimableBalances}
          processingStatuses={processingStatuses}
          formatTimeRemaining={formatTimeRemaining}
          onRemove={onRemoveWallet}
          maskAddress={maskAddress}
        />
      ))}
    </div>
  );
};

export default WalletList;
