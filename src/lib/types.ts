export type TransactionStatus = 
  | 'idle'
  | 'fetching_sequence'
  | 'waiting'
  | 'constructing'
  | 'signing'
  | 'submitting'
  | 'completed'
  | 'failed';

export interface ClaimableBalance {
  id: string;
  amount: string;
  unlockTime: Date;
  walletId: string;
}

export interface WalletData {
  id: string;
  address: string;
  privateKey: string;
  destinationAddress: string;
  added: Date;
}

export interface LogEntry {
  id: string;
  message: string;
  timestamp: Date;
  status: 'info' | 'success' | 'warning' | 'error';
  walletId?: string;
}
