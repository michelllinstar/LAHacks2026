import jwt from 'jsonwebtoken';
import { serialize } from 'cookie';

const SECRET = process.env.JWT_SECRET || 'dev-secret-token';
const USERS = [
  { id: 'u1', email: 'admin@agentverse.app', password: 'password123', name: 'Agentverse Admin' }
];

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { email, password } = req.body;
  const user = USERS.find((account) => account.email === email && account.password === password);

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name }, SECRET, {
    expiresIn: '8h'
  });

  res.setHeader('Set-Cookie', serialize('agentverse_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60
  }));

  return res.status(200).json({ message: 'Authenticated' });
}
