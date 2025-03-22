
import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { validateKeyPair } from '@/utils/piWalletUtils';

interface DirectKeyInputProps {
  onKeysUpdated: (publicKey: string, privateKey: string) => void;
}

const DirectKeyInput: React.FC<DirectKeyInputProps> = ({ onKeysUpdated }) => {
  const [walletAddress, setWalletAddress] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Validate keys when they change
  useEffect(() => {
    if (walletAddress && privateKey) {
      const isValid = validateKeyPair(walletAddress, privateKey);
      if (!isValid) {
        setKeyError('Private key does not match the provided wallet address');
      } else {
        setKeyError(null);
        onKeysUpdated(walletAddress, privateKey);
      }
    } else {
      setKeyError(null);
      onKeysUpdated('', '');
    }
  }, [walletAddress, privateKey, onKeysUpdated]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="walletAddress">Source Wallet Address</Label>
        <Input
          id="walletAddress"
          placeholder="Enter wallet address to monitor"
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
          required
          className={`transition duration-200 ${keyError ? 'border-destructive' : ''}`}
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="privateKey" className="flex justify-between">
          <span>Private Key</span>
          <button
            type="button"
            onClick={() => setShowPrivateKey(!showPrivateKey)}
            className="text-xs text-muted-foreground hover:text-primary transition"
          >
            {showPrivateKey ? 'Hide' : 'Show'}
          </button>
        </Label>
        <Input
          id="privateKey"
          type={showPrivateKey ? 'text' : 'password'}
          placeholder="Enter private key for signing transactions"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          required
          className={`transition duration-200 ${keyError ? 'border-destructive' : ''}`}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Your key is only stored locally and never transmitted
        </p>
        {keyError && (
          <p className="text-xs text-destructive mt-1">
            {keyError}
          </p>
        )}
      </div>
    </div>
  );
};

export default DirectKeyInput;
