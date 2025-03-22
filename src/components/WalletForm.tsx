
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Plus } from 'lucide-react';
import SeedPhraseInput from './SeedPhraseInput';
import DirectKeyInput from './DirectKeyInput';
import DestinationAddressInput from './DestinationAddressInput';
import { toast } from 'sonner';

interface WalletFormProps {
  onAddWallet: (walletData: { address: string; privateKey: string; destinationAddress: string }) => boolean;
  className?: string;
}

const WalletForm: React.FC<WalletFormProps> = ({ onAddWallet, className = '' }) => {
  const [useSeedPhrase, setUseSeedPhrase] = useState(true);
  const [sourceAddress, setSourceAddress] = useState('');
  const [sourcePrivateKey, setSourcePrivateKey] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [isDestinationValid, setIsDestinationValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handler for when keys are generated or updated
  const handleKeysUpdated = (address: string, privateKey: string) => {
    setSourceAddress(address);
    setSourcePrivateKey(privateKey);
  };

  // Handler for destination address updates
  const handleDestinationUpdated = (address: string, isValid: boolean) => {
    setDestinationAddress(address);
    setIsDestinationValid(isValid);
  };

  // Check if form is valid and can be submitted
  const canSubmit = () => {
    return sourceAddress && sourcePrivateKey && destinationAddress && isDestinationValid;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canSubmit()) {
      toast.error('Please complete all fields correctly');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const success = onAddWallet({
        address: sourceAddress,
        privateKey: sourcePrivateKey,
        destinationAddress: destinationAddress
      });
      
      if (success) {
        // Reset form after successful submission
        setSourceAddress('');
        setSourcePrivateKey('');
        setDestinationAddress('');
      }
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(`Submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className={`glass-morphism animate-fade-in ${className}`}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          Add New Wallet
        </CardTitle>
        <CardDescription>
          Add a wallet to automatically claim and transfer Pi when unlocked
        </CardDescription>
        
        {/* Toggle button between seed phrase and direct keys */}
        <div className="flex items-center justify-end mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setUseSeedPhrase(!useSeedPhrase);
              // Reset form when switching modes
              setSourceAddress('');
              setSourcePrivateKey('');
            }}
            className="text-xs"
          >
            {useSeedPhrase ? 'Use Direct Keys' : 'Use Seed Phrase'}
          </Button>
        </div>
      </CardHeader>
      
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {useSeedPhrase ? (
            <SeedPhraseInput onKeysGenerated={handleKeysUpdated} />
          ) : (
            <DirectKeyInput onKeysUpdated={handleKeysUpdated} />
          )}
          
          <DestinationAddressInput onAddressUpdated={handleDestinationUpdated} />
        </CardContent>
        
        <CardFooter>
          <Button 
            type="submit" 
            className="w-full gap-2 group" 
            disabled={isSubmitting || !canSubmit()}
          >
            <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
            Add Wallet
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default WalletForm;
