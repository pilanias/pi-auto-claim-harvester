
import express from 'express';
import { getLogs, clearLogs } from '../services/logService.js';

const router = express.Router();

// Get all logs
router.get('/logs', (req, res) => {
  try {
    const logs = getLogs();
    res.json(logs);
  } catch (error) {
    console.error('Error in get logs endpoint:', error);
    res.status(500).json({ 
      message: `Failed to get logs: ${error.message}` 
    });
  }
});

// Clear all logs
router.delete('/logs', (req, res) => {
  try {
    clearLogs();
    res.json({ message: 'Logs cleared' });
  } catch (error) {
    console.error('Error in clear logs endpoint:', error);
    res.status(500).json({ 
      message: `Failed to clear logs: ${error.message}` 
    });
  }
});

export default router;
