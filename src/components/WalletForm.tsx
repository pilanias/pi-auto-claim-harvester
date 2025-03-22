
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Wallet, Key, ArrowRight, Plus, RefreshCw } from 'lucide-react';
import * as StellarSdk from 'stellar-sdk';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';

interface WalletFormProps {
  onAddWallet: (walletData: { address: string; privateKey: string; destinationAddress: string }) => boolean;
  className?: string;
}

// Pi uses BIP-44 derivation path for ED25519
const PI_DERIVATION_PATH = "m/44'/314159'/0'"; 

const WalletForm: React.FC<WalletFormProps> = ({ onAddWallet, className = '' }) => {
  const [useSeedPhrase, setUseSeedPhrase] = useState(true);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [derivedAddress, setDerivedAddress] = useState('');
  const [derivedPrivateKey, setDerivedPrivateKey] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [isDerivingKeys, setIsDerivingKeys] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [derivationError, setDerivationError] = useState<string | null>(null);

  // Function to derive keys from seed phrase using proper BIP39 derivation
  const deriveKeysFromSeedPhrase = async () => {
    try {
      setIsDerivingKeys(true);
      setDerivationError(null);
      
      // Simple validation
      const trimmedSeedPhrase = seedPhrase.trim();
      if (!trimmedSeedPhrase) {
        throw new Error('Seed phrase is required');
      }
      
      // Split the seed phrase into words and clean any extra whitespace
      const words = trimmedSeedPhrase.split(/\s+/);
      
      // Basic validation of word count (BIP-39 standard)
      if (words.length !== 12 && words.length !== 24) {
        const errorMsg = `Invalid seed phrase length: ${words.length} words. Must be 12 or 24 words.`;
        toast.error(errorMsg);
        setDerivationError(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Validate the mnemonic
      if (!bip39.validateMnemonic(trimmedSeedPhrase)) {
        const errorMsg = 'Invalid mnemonic phrase. Please check your seed words.';
        toast.error(errorMsg);
        setDerivationError(errorMsg);
        throw new Error(errorMsg);
      }

      // Generate seed from mnemonic
      const seed = await bip39.mnemonicToSeed(trimmedSeedPhrase);
      
      // Derive the key using Pi's derivation path
      const derived = derivePath(PI_DERIVATION_PATH, Buffer.from(seed).toString('hex'));
      const privateKeyBuffer = Buffer.from(derived.key);
      
      // Convert to Stellar keypair
      const keypair = StellarSdk.Keypair.fromRawEd25519Seed(privateKeyBuffer);
      
      // Get the derived public and private keys
      const publicKey = keypair.publicKey();
      const secretKey = keypair.secret();
      
      console.log('Derived public key:', publicKey);
      console.log('Derived secret key (first 4 chars):', secretKey.substring(0, 4) + '...');
      
      // Update the state with derived keys
      setDerivedAddress(publicKey);
      setDerivedPrivateKey(secretKey);
      
      toast.success("Successfully derived wallet address");
      return { publicKey, secretKey };
      
    } catch (error) {
      console.error('Error deriving keys:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to derive keys: ${errorMessage}`);
      
      if (!derivationError) {
        setDerivationError(errorMessage);
      }
      
      throw error;
    } finally {
      setIsDerivingKeys(false);
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // If using seed phrase, ensure we have derived keys
      if (useSeedPhrase) {
        if (!derivedAddress || !derivedPrivateKey) {
          const keys = await deriveKeysFromSeedPhrase();
          if (!keys) return;
        }
        
        // Submit with derived keys
        const success = onAddWallet({
          address: derivedAddress,
          privateKey: derivedPrivateKey,
          destinationAddress: destinationAddress.trim()
        });
        
        if (success) {
          // Reset form after successful submission
          setSeedPhrase('');
          setDerivedAddress('');
          setDerivedPrivateKey('');
          setDestinationAddress('');
          setDerivationError(null);
        }
      } else {
        // Direct private key submission
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
              setDerivationError(null);
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
            <>
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
                      setDerivedPrivateKey('');
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
                  onClick={deriveKeysFromSeedPhrase}
                  disabled={isDerivingKeys || !seedPhrase.trim()}
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
            </>
          ) : (
            <>
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
            </>
          )}
          
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
            disabled={isSubmitting || (useSeedPhrase && !derivedAddress)}
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
