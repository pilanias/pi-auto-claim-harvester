
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Wallet, Key, ArrowRight, Plus } from 'lucide-react';

interface WalletFormProps {
  onAddWallet: (walletData: { address: string; privateKey: string; destinationAddress: string }) => boolean;
  className?: string;
}

const WalletForm: React.FC<WalletFormProps> = ({ onAddWallet, className = '' }) => {
  const [walletAddress, setWalletAddress] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const success = onAddWallet({
        address: walletAddress.trim(),
        privateKey: privateKey.trim(),
        destinationAddress: destinationAddress.trim()
      });
      
      if (success) {
        // Reset form after successful submission
        setWalletAddress('');
        setPrivateKey('');
        setDestinationAddress('');
        setShowPrivateKey(false);
      }
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
      </CardHeader>
      
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="walletAddress">Source Wallet Address</Label>
            <Input
              id="walletAddress"
              placeholder="Enter wallet address to monitor"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              required
              className="transition duration-200"
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
              className="transition duration-200"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Your key is only stored locally and never transmitted
            </p>
          </div>
          
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
                className="transition duration-200"
              />
            </div>
          </div>
        </CardContent>
        
        <CardFooter>
          <Button 
            type="submit" 
            className="w-full gap-2 group" 
            disabled={isSubmitting}
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
