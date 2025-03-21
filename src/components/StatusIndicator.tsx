
import React from 'react';
import { TransactionStatus } from '@/lib/types';
import { CircleOff, Clock, Loader2, Ban, CheckCircle, Database, PencilRuler, Key, Send } from 'lucide-react';

interface StatusIndicatorProps {
  status: TransactionStatus;
  className?: string;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, className = '' }) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'idle':
        return { icon: <CircleOff className="w-4 h-4" />, label: 'Idle', color: 'text-gray-400' };
      case 'fetching_balance':
        return { icon: <Database className="w-4 h-4 animate-pulse" />, label: 'Fetching Balance', color: 'text-blue-400' };
      case 'waiting':
        return { icon: <Clock className="w-4 h-4 animate-pulse-subtle" />, label: 'Waiting for Unlock', color: 'text-yellow-400' };
      case 'fetching_sequence':
        return { icon: <Database className="w-4 h-4 animate-pulse" />, label: 'Fetching Sequence', color: 'text-blue-400' };
      case 'constructing':
        return { icon: <PencilRuler className="w-4 h-4 animate-pulse" />, label: 'Constructing', color: 'text-purple-400' };
      case 'signing':
        return { icon: <Key className="w-4 h-4 animate-pulse" />, label: 'Signing', color: 'text-indigo-400' };
      case 'submitting':
        return { icon: <Send className="w-4 h-4 animate-pulse" />, label: 'Submitting', color: 'text-cyan-400' };
      case 'completed':
        return { icon: <CheckCircle className="w-4 h-4" />, label: 'Completed', color: 'text-green-500' };
      case 'failed':
        return { icon: <Ban className="w-4 h-4" />, label: 'Failed', color: 'text-red-500' };
      default:
        return { icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Processing', color: 'text-blue-500' };
    }
  };

  const { icon, label, color } = getStatusInfo();

  return (
    <div className={`inline-flex items-center gap-1.5 ${color} ${className}`}>
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
};

export default StatusIndicator;
