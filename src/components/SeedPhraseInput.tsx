
import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { deriveKeysFromSeedPhrase } from '@/utils/piWalletUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface SeedPhraseInputProps {
  onKeysGenerated: (publicKey: string, privateKey: string) => void;
}

const SeedPhraseInput: React.FC<SeedPhraseInputProps> = ({ onKeysGenerated }) => {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [isDerivingKeys, setIsDerivingKeys] = useState(false);
  const [derivedAddress, setDerivedAddress] = useState('');
  const [derivationError, setDerivationError] = useState<string | null>(null);
  const [derivationAttempts, setDerivationAttempts] = useState(0);

  const handleDeriveKeys = async () => {
    try {
      setIsDerivingKeys(true);
      setDerivationError(null);
      setDerivationAttempts(prev => prev + 1);
      
      // Use a longer delay to ensure UI updates and to allow time for crypto operations
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const keys = await deriveKeysFromSeedPhrase(seedPhrase);
      if (!keys) throw new Error('Failed to derive keys');
      
      setDerivedAddress(keys.publicKey);
      onKeysGenerated(keys.publicKey, keys.secretKey);
      toast.success("Successfully derived wallet address");
      
    } catch (error) {
      console.error('Error deriving keys:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to derive keys: ${errorMessage}`);
      setDerivationError(errorMessage);
    } finally {
      setIsDerivingKeys(false);
    }
  };

  return (
    <div className="space-y-4">
      {derivationError && (
        <Alert variant="destructive" className="animate-shake">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {derivationError}
            {derivationAttempts > 1 && 
              ' Please ensure you entered the correct seed phrase or try a different browser.'}
          </AlertDescription>
        </Alert>
      )}
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="seedPhrase">Seed Phrase</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <HelpCircle className="h-4 w-4" />
                  <span className="sr-only">Seed phrase help</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Enter your 12 or 24 word seed phrase to derive your Pi wallet keys.
                  For Pi wallets, this should be the same seed phrase you use for your
                  Pi wallet.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Textarea
          id="seedPhrase"
          placeholder="Enter your 12 or 24 word seed phrase, separated by spaces"
          value={seedPhrase}
          onChange={(e) => {
            setSeedPhrase(e.target.value);
            // Clear derived values when seed phrase changes
            if (derivedAddress) {
              setDerivedAddress('');
              onKeysGenerated('', '');
            }
            if (derivationError) {
              setDerivationError(null);
            }
          }}
          rows={3}
          required
          className={`transition duration-200 ${derivationError ? 'border-destructive' : ''}`}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Your seed phrase is only stored locally and never transmitted
        </p>
      </div>
      
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDeriveKeys}
          disabled={isDerivingKeys || !seedPhrase}
          className="gap-2"
        >
          {isDerivingKeys ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Derive Keys
        </Button>
      </div>
      
      {derivedAddress && (
        <div className="p-3 bg-muted/50 rounded-md space-y-1">
          <Label className="text-xs">Derived Wallet Address:</Label>
          <p className="text-sm font-mono break-all">{derivedAddress}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Verify this matches your expected Pi wallet address
          </p>
        </div>
      )}
    </div>
  );
};

export default SeedPhraseInput;
