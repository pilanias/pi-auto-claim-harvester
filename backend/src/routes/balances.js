
import express from 'express';
import { fetchClaimableBalances } from '../services/piNetworkApi.js';
import { getAllClaimableBalances, getWalletClaimableBalances, removeClaimableBalance } from '../services/walletMonitor.js';
import { fetchSequenceNumber } from '../services/piNetworkApi.js';

const router = express.Router();

// Get claimable balances for a wallet
router.get('/claimable-balances/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const balances = await fetchClaimableBalances(address);
    res.json(balances);
  } catch (error) {
    console.error('Error in claimable-balances endpoint:', error);
    res.status(500).json({ 
      message: `Failed to fetch claimable balances: ${error.message}` 
    });
  }
});

// Get all claimable balances being monitored
router.get('/monitored-balances', (req, res) => {
  try {
    const balances = getAllClaimableBalances();
    res.json(balances);
  } catch (error) {
    console.error('Error in monitored-balances endpoint:', error);
    res.status(500).json({ 
      message: `Failed to get monitored balances: ${error.message}` 
    });
  }
});

// Get monitored balances for a specific wallet
router.get('/monitored-balances/:walletId', (req, res) => {
  try {
    const balances = getWalletClaimableBalances(req.params.walletId);
    res.json(balances);
  } catch (error) {
    console.error('Error in monitored-balances for wallet endpoint:', error);
    res.status(500).json({ 
      message: `Failed to get monitored balances: ${error.message}` 
    });
  }
});

// Get sequence number for an account
router.get('/sequence/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const sequence = await fetchSequenceNumber(address);
    res.json({ sequence });
  } catch (error) {
    console.error('Error in sequence endpoint:', error);
    res.status(500).json({ 
      message: `Failed to fetch sequence number: ${error.message}` 
    });
  }
});

// Remove a claimable balance (usually after claiming)
router.delete('/monitored-balances/:balanceId', (req, res) => {
  try {
    removeClaimableBalance(req.params.balanceId);
    res.json({ message: 'Balance removed from monitoring' });
  } catch (error) {
    console.error('Error in delete monitored-balance endpoint:', error);
    res.status(500).json({ 
      message: `Failed to remove balance: ${error.message}` 
    });
  }
});

export default router;
