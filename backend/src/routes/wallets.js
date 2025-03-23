
import express from 'express';
import { addWallet, getWallets, getWalletById, removeWallet } from '../services/walletService.js';

const router = express.Router();

// Add a new wallet for monitoring
router.post('/monitor-wallet', async (req, res) => {
  try {
    const { address, privateKey, destinationAddress } = req.body;
    
    if (!address || !privateKey || !destinationAddress) {
      return res.status(400).json({ 
        message: 'All wallet fields are required' 
      });
    }
    
    const result = await addWallet({
      address,
      privateKey,
      destinationAddress
    });
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Error in monitor-wallet endpoint:', error);
    res.status(500).json({ 
      message: `Failed to add wallet: ${error.message}` 
    });
  }
});

// Get all monitored wallets
router.get('/wallets', (req, res) => {
  try {
    const wallets = getWallets();
    res.json(wallets);
  } catch (error) {
    console.error('Error in get wallets endpoint:', error);
    res.status(500).json({ 
      message: `Failed to get wallets: ${error.message}` 
    });
  }
});

// Get a specific wallet
router.get('/wallets/:id', (req, res) => {
  try {
    const wallet = getWalletById(req.params.id);
    
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    res.json(wallet);
  } catch (error) {
    console.error('Error in get wallet endpoint:', error);
    res.status(500).json({ 
      message: `Failed to get wallet: ${error.message}` 
    });
  }
});

// Stop monitoring a wallet
router.delete('/stop-monitoring/:id', async (req, res) => {
  try {
    const success = await removeWallet(req.params.id);
    
    if (!success) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    res.json({ message: 'Wallet monitoring stopped' });
  } catch (error) {
    console.error('Error in stop-monitoring endpoint:', error);
    res.status(500).json({ 
      message: `Failed to stop monitoring: ${error.message}` 
    });
  }
});

export default router;
