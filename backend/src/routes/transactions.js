
import express from 'express';
import { submitTransaction } from '../services/piNetworkApi.js';

const router = express.Router();

// Submit a transaction
router.post('/submit-transaction', async (req, res) => {
  try {
    const { tx } = req.body;
    
    if (!tx) {
      return res.status(400).json({ message: 'Transaction XDR is required' });
    }
    
    const result = await submitTransaction(tx);
    res.json(result);
  } catch (error) {
    console.error('Error in submit-transaction endpoint:', error);
    res.status(500).json({ 
      message: `Failed to submit transaction: ${error.message}`,
      error: error.message
    });
  }
});

export default router;
