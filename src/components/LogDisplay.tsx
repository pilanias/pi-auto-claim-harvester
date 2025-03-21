
import React, { useEffect, useRef } from 'react';
import { LogEntry } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Info, XCircle, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface LogDisplayProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  className?: string;
}

const LogDisplay: React.FC<LogDisplayProps> = ({ logs, onClearLogs, className = '' }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new logs are added
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [logs]);

  const getStatusIcon = (status: LogEntry['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
      case 'info':
      default:
        return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    }
  };

  return (
    <div className={`border rounded-lg shadow-sm bg-white ${className}`}>
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-medium text-sm">System Logs</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearLogs}
          className="h-8 px-2 text-muted-foreground"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Clear
        </Button>
      </div>
      
      <ScrollArea className="h-[300px]" ref={scrollRef}>
        <div className="p-2">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
              No logs yet
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div 
                  key={log.id} 
                  className="text-xs p-2 rounded flex items-start gap-2 animate-fade-in"
                >
                  {getStatusIcon(log.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground whitespace-normal break-words">{log.message}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {formatDistanceToNow(log.timestamp, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default LogDisplay;
