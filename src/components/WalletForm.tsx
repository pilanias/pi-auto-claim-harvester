import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Wallet, Key, ArrowRight, Plus, AlertCircle, Check, FileText, Loader2 } from 'lucide-react';
import * as StellarSdk from 'stellar-sdk';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { validateMnemonic, generatePiWallet } from '@/lib/seedPhrase';
import { toast } from 'sonner';

interface WalletFormProps {
  onAddWallet: (walletData: { address: string; privateKey: string; destinationAddress: string }) => boolean;
  className?: string;
}

const WalletForm: React.FC<WalletFormProps> = ({ onAddWallet, className = '' }) => {
  // Common state
  const [destinationAddress, setDestinationAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Private key method state
  const [walletAddress, setWalletAddress] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'verifying' | 'verified' | 'error'>('idle');
  
  // Seed phrase method state
  const [seedPhrase, setSeedPhrase] = useState('');
  const [seedError, setSeedError] = useState<string | null>(null);
  const [generatedWallet, setGeneratedWallet] = useState<{
    piAddress: string;
    publicKey: string;
    privateKey: string;
  } | null>(null);
  const [isGeneratingFromSeed, setIsGeneratingFromSeed] = useState(false);

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
  
  // Validate seed phrase as it's typed
  useEffect(() => {
    if (!seedPhrase.trim()) {
      setSeedError(null);
      setGeneratedWallet(null);
      return;
    }

    // Basic validation - should be 24 words
    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 24) {
      setSeedError(`Expected 24 words, got ${words.length}`);
      setGeneratedWallet(null);
      return;
    }

    // Use our custom validation
    const isValid = validateMnemonic(seedPhrase.trim());
    if (!isValid) {
      setSeedError('Invalid seed phrase. Please check your words and try again.');
      setGeneratedWallet(null);
    } else {
      setSeedError(null);
    }
  }, [seedPhrase]);

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

  const generateWalletFromSeed = async () => {
    if (!seedPhrase.trim()) return;
    
    setIsGeneratingFromSeed(true);
    setSeedError(null);
    
    try {
      console.log("Attempting to generate wallet from seed phrase...");
      const wallet = await generatePiWallet(seedPhrase.trim());
      setGeneratedWallet(wallet);
      
      // Auto-fill the destination address with the same address 
      // if it hasn't been filled yet (user can change it after)
      if (!destinationAddress) {
        setDestinationAddress(wallet.piAddress);
      }
      
      toast.success("Wallet successfully generated from seed phrase");
    } catch (error) {
      console.error("Seed phrase wallet generation error:", error);
      setSeedError(`Failed to generate wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setGeneratedWallet(null);
      toast.error("Failed to generate wallet from seed phrase");
    } finally {
      setIsGeneratingFromSeed(false);
    }
  };

  const handleSubmitPrivateKey = (e: React.FormEvent) => {
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

  const handleSubmitSeedPhrase = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      if (!generatedWallet) {
        setSeedError('Please generate wallet from seed phrase first');
        return;
      }
      
      if (!destinationAddress) {
        setSeedError('Destination address is required');
        return;
      }
      
      const success = onAddWallet({
        address: generatedWallet.piAddress,
        privateKey: generatedWallet.privateKey,
        destinationAddress: destinationAddress.trim()
      });
      
      if (success) {
        // Reset form after successful submission
        setSeedPhrase('');
        setDestinationAddress('');
        setGeneratedWallet(null);
        setSeedError(null);
      }
    } catch (error) {
      setSeedError(`Error adding wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      
      <Tabs defaultValue="private-key" className="w-full">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="private-key" className="flex-1"><Key className="w-4 h-4 mr-2" /> Private Key</TabsTrigger>
          <TabsTrigger value="seed-phrase" className="flex-1"><FileText className="w-4 h-4 mr-2" /> Seed Phrase</TabsTrigger>
        </TabsList>
        
        <TabsContent value="private-key">
          <form onSubmit={handleSubmitPrivateKey}>
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
        </TabsContent>
        
        <TabsContent value="seed-phrase">
          <form onSubmit={handleSubmitSeedPhrase}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="seedPhrase" className="flex justify-between">
                  <span>24-Word Seed Phrase</span>
                </Label>
                <Textarea
                  id="seedPhrase"
                  placeholder="Enter your 24-word seed phrase separated by spaces..."
                  value={seedPhrase}
                  onChange={(e) => setSeedPhrase(e.target.value)}
                  required
                  className="min-h-24 transition duration-200"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Your seed phrase is only used locally and never transmitted
                </p>
                
                {seedError && (
                  <Alert variant="destructive" className="py-2 mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {seedError}
                    </AlertDescription>
                  </Alert>
                )}
                
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full mt-2"
                  onClick={generateWalletFromSeed}
                  disabled={isGeneratingFromSeed || !seedPhrase.trim()}
                >
                  {isGeneratingFromSeed ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Generate Wallet"
                  )}
                </Button>
                
                {generatedWallet && (
                  <Alert variant="default" className="py-3 mt-2 bg-green-50 text-green-800 border-green-200">
                    <Check className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-xs">
                      <p className="font-medium">Wallet generated successfully!</p>
                      <p className="mt-1">Address: {generatedWallet.piAddress.substring(0, 8)}...{generatedWallet.piAddress.substring(generatedWallet.piAddress.length - 4)}</p>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="destinationAddressSeed">Destination Address</Label>
                <div className="flex items-center space-x-2">
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    id="destinationAddressSeed"
                    placeholder="Where to send Pi after claiming"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    required
                    className="transition duration-200"
                  />
                </div>
                {generatedWallet && !destinationAddress && (
                  <p className="text-xs text-muted-foreground">
                    You can use the same address as your wallet
                  </p>
                )}
              </div>
            </CardContent>
            
            <CardFooter>
              <Button 
                type="submit" 
                className="w-full gap-2 group" 
                disabled={isSubmitting || !generatedWallet || !destinationAddress}
              >
                <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                Add Wallet
              </Button>
            </CardFooter>
          </form>
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default WalletForm;
