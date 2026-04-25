import express from 'express';
import { queryAgentverse } from '../lib/agentverse.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { question, projectContext } = req.body;
  try {
    const response = await queryAgentverse(question, projectContext);
    return res.status(200).json({ result: response });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Agentverse query failed' });
  }
});

router.all('*', (req, res) => {
  res.status(405).json({ message: 'Method not allowed' });
});

export default router;
