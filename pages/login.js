import { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await axios.post('/api/auth/login', { email, password });
      router.push('/dashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed');
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Login to Agentverse UML</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Sign in</button>
        </form>
      </div>
      <style jsx>{`
        .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
        .auth-card { width: 100%; max-width: 420px; background: #111827; padding: 2rem; border-radius: 1rem; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35); }
        form label { display: block; margin-bottom: 1rem; color: #e2e8f0; }
        input { width: 100%; padding: 0.9rem 1rem; margin-top: 0.5rem; border-radius: 0.75rem; border: 1px solid #334155; background: #0f172a; color: white; }
        button { width: 100%; margin-top: 1rem; padding: 0.95rem 1rem; border-radius: 999px; border: none; background: #2563eb; color: white; cursor: pointer; }
        .error { color: #f87171; margin: 0.75rem 0 0; }
      `}</style>
    </main>
  );
}
