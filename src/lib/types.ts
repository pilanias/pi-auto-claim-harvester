
export type WalletData = {
  id: string;
  address: string;
  privateKey: string;
  destinationAddress: string;
  added: Date;
};

export type ClaimableBalance = {
  id: string;
  amount: string;
  unlockTime: Date;
  walletId: string;
};

export type TransactionStatus = 
  | 'idle' 
  | 'fetching_balance' 
  | 'waiting' 
  | 'fetching_sequence' 
  | 'constructing' 
  | 'signing' 
  | 'submitting' 
  | 'completed' 
  | 'failed';

export type LogEntry = {
  id: string;
  timestamp: Date;
  message: string;
  walletId?: string;
  status: 'info' | 'success' | 'warning' | 'error';
};

export type StatusUpdate = {
  walletId: string;
  balanceId?: string;
  status: TransactionStatus;
  message?: string;
  timestamp: Date;
};
