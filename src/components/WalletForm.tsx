
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Wallet, Key, ArrowRight, Plus, AlertCircle, Check } from 'lucide-react';
import * as StellarSdk from 'stellar-sdk';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
  const [keyError, setKeyError] = useState<string | null>(null);
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'verifying' | 'verified' | 'error'>('idle');

  // Validate private key and derive public key when it changes
  useEffect(() => {
    if (!privateKey) {
      setKeyError(null);
      setDerivedAddress(null);
      setValidationStatus('idle');
      return;
    }

    setValidationStatus('verifying');

    try {
      // Clean private key (trim whitespace)
      const cleanPrivateKey = privateKey.trim();
      
      // Basic format validation
      if (!cleanPrivateKey.startsWith('S')) {
        setKeyError('Invalid private key format - must start with S');
        setDerivedAddress(null);
        setValidationStatus('error');
        return;
      }

      // Try to create a keypair from the private key
      const keyPair = StellarSdk.Keypair.fromSecret(cleanPrivateKey);
      const publicKey = keyPair.publicKey();
      
      setDerivedAddress(publicKey);
      setKeyError(null);
      setValidationStatus('verified');
      
      // Auto-update the wallet address field to match the derived address
      setWalletAddress(publicKey);

    } catch (error) {
      setKeyError(`Invalid private key: ${error instanceof Error ? error.message : 'Unknown format'}`);
      setDerivedAddress(null);
      setValidationStatus('error');
    }
  }, [privateKey]);

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAddress = e.target.value;
    setWalletAddress(newAddress);
    
    // If we have a derived address, verify it matches the new input
    if (derivedAddress && newAddress && derivedAddress !== newAddress) {
      setKeyError('Warning: Private key generates a different public address than entered');
      setValidationStatus('error');
    } else if (derivedAddress && newAddress && derivedAddress === newAddress) {
      setKeyError(null);
      setValidationStatus('verified');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Do a final check before submission
      if (privateKey) {
        try {
          const cleanPrivateKey = privateKey.trim();
          const keyPair = StellarSdk.Keypair.fromSecret(cleanPrivateKey);
          const publicKey = keyPair.publicKey();
          
          // Always use the address derived from the private key for maximum security
          if (publicKey !== walletAddress) {
            console.log(`Correcting address to match private key: ${publicKey}`);
            setWalletAddress(publicKey);
          }
          
          const success = onAddWallet({
            address: publicKey,
            privateKey: cleanPrivateKey,
            destinationAddress: destinationAddress.trim()
          });
          
          if (success) {
            // Reset form after successful submission
            setWalletAddress('');
            setPrivateKey('');
            setDestinationAddress('');
            setShowPrivateKey(false);
            setKeyError(null);
            setDerivedAddress(null);
            setValidationStatus('idle');
          }
        } catch (error) {
          setKeyError(`Error with private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
          setValidationStatus('error');
        }
      } else {
        setKeyError('Private key is required');
        setValidationStatus('error');
      }
    } catch (error) {
      setKeyError(`Error processing wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setValidationStatus('error');
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
            <Label htmlFor="walletAddress" className="flex items-center gap-2">
              Source Wallet Address
              {derivedAddress && 
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  (Auto-detected from private key)
                </span>
              }
            </Label>
            <Input
              id="walletAddress"
              placeholder="Enter wallet address to monitor"
              value={derivedAddress || walletAddress}
              onChange={handleAddressChange}
              required
              className={`transition duration-200 ${derivedAddress ? 'bg-muted/50' : ''}`}
              readOnly={!!derivedAddress}
            />
            {derivedAddress && 
              <p className="text-xs text-green-500 flex items-center gap-1">
                <Check className="w-3 h-3" />
                The address has been automatically detected from your private key
              </p>
            }
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="privateKey" className="flex justify-between">
              <span>Private Key (Secret Key)</span>
              <button
                type="button"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                className="text-xs text-muted-foreground hover:text-primary transition"
              >
                {showPrivateKey ? 'Hide' : 'Show'}
              </button>
            </Label>
            <div className="relative">
              <Input
                id="privateKey"
                type={showPrivateKey ? 'text' : 'password'}
                placeholder="Enter private key starting with S..."
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                required
                className={`transition duration-200 ${
                  validationStatus === 'error' ? 'border-red-300' : 
                  validationStatus === 'verified' ? 'border-green-300' : ''
                }`}
              />
              {validationStatus === 'verified' && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <Check className="w-4 h-4 text-green-500" />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Your key is only stored locally and never transmitted
            </p>
            
            {keyError && (
              <Alert variant="destructive" className="py-2 mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {keyError}
                </AlertDescription>
              </Alert>
            )}
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
            disabled={isSubmitting || validationStatus === 'error'}
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
