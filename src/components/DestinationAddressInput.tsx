
import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ArrowRight } from 'lucide-react';
import { validateStellarAddress } from '@/utils/piWalletUtils';

interface DestinationAddressInputProps {
  onAddressUpdated: (address: string, isValid: boolean) => void;
}

const DestinationAddressInput: React.FC<DestinationAddressInputProps> = ({ onAddressUpdated }) => {
  const [destinationAddress, setDestinationAddress] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);

  useEffect(() => {
    if (destinationAddress) {
      const isValid = validateStellarAddress(destinationAddress);
      if (!isValid) {
        setAddressError('Invalid destination address format');
        onAddressUpdated(destinationAddress, false);
      } else {
        setAddressError(null);
        onAddressUpdated(destinationAddress, true);
      }
    } else {
      setAddressError(null);
      onAddressUpdated('', false);
    }
  }, [destinationAddress, onAddressUpdated]);

  return (
    <div className="space-y-2">
      <Label htmlFor="destinationAddress">Destination Address</Label>
      <div className="flex items-center space-x-2">
        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <Input
          id="destinationAddress"
          placeholder="Where to send Pi after claiming"
          value={destinationAddress}
          onChange={(e) => setDestinationAddress(e.target.value)}
          required
          className={`transition duration-200 ${addressError ? 'border-destructive' : ''}`}
        />
      </div>
      {addressError && (
        <p className="text-xs text-destructive mt-1">
          {addressError}
        </p>
      )}
    </div>
  );
};

export default DestinationAddressInput;
