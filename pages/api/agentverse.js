import { queryAgentverse } from '../../lib/agentverse';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { question, projectContext } = req.body;
  try {
    const response = await queryAgentverse(question, projectContext);
    return res.status(200).json({ result: response });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Agentverse query failed' });
  }
}
