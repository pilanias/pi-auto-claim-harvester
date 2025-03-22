
import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { deriveKeysFromSeedPhrase } from '@/utils/piWalletUtils';

interface SeedPhraseInputProps {
  onKeysGenerated: (publicKey: string, privateKey: string) => void;
}

const SeedPhraseInput: React.FC<SeedPhraseInputProps> = ({ onKeysGenerated }) => {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [isDerivingKeys, setIsDerivingKeys] = useState(false);
  const [derivedAddress, setDerivedAddress] = useState('');
  const [derivationError, setDerivationError] = useState<string | null>(null);

  const handleDeriveKeys = async () => {
    try {
      setIsDerivingKeys(true);
      setDerivationError(null);
      
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
      <div className="space-y-2">
        <Label htmlFor="seedPhrase">Seed Phrase</Label>
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
        {derivationError && (
          <p className="text-xs text-destructive mt-1">
            {derivationError}
          </p>
        )}
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
