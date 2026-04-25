import { useState } from 'react';
import axios from 'axios';

export default function RepoConnector({ onProjectCreated }) {
  const [repoUrl, setRepoUrl] = useState('');
  const [schemaUrl, setSchemaUrl] = useState('');
  const [message, setMessage] = useState('');

  const handleConnect = async (event) => {
    event.preventDefault();
    try {
      const response = await axios.post('/api/projects', {
        name: 'Connected UML Project',
        description: 'Imported from repo',
        cloudinaryUrl: '',
        repoUrl: repoUrl || schemaUrl
      });
      setMessage('Project connected successfully.');
      onProjectCreated(response.data.project);
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Connection failed.');
    }
  };

  return (
    <div className="repo-card">
      <form onSubmit={handleConnect}>
        <label>
          Git repo URL
          <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/org/repo" />
        </label>
        <label>
          Or local schema folder URL
          <input value={schemaUrl} onChange={(e) => setSchemaUrl(e.target.value)} placeholder="file://local/path or schema endpoint" />
        </label>
        <button type="submit">Connect repository</button>
      </form>
      {message && <p className="note">{message}</p>}
      <style jsx>{`
        .repo-card { display: flex; flex-direction: column; gap: 1rem; }
        label { display: grid; gap: 0.75rem; color: #cbd5e1; }
        input { width: 100%; padding: 0.9rem 1rem; border-radius: 0.85rem; border: 1px solid #334155; background: #0f172a; color: white; }
        button { padding: 0.95rem 1rem; background: #2563eb; border: none; border-radius: 999px; color: white; cursor: pointer; }
        .note { color: #94a3b8; }
      `}</style>
    </div>
  );
}
