import { useState } from 'react';
import { createRepo, triggerIndex } from '../lib/api';

export default function RepoConnector({ onCreated }) {
  const [gitUrl, setGitUrl] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!gitUrl && !localPath) {
      setMessage('Provide a Git URL or a local path.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const body = {};
      if (gitUrl) body.git_url = gitUrl;
      if (localPath) body.local_path = localPath;
      if (name) body.name = name;
      const repo = await createRepo(body);
      try { await triggerIndex(repo.hash); } catch (_) {}
      setMessage(`Created ${repo.name} (${repo.hash}). Indexing started.`);
      if (onCreated) onCreated(repo);
    } catch (err) {
      setMessage(err?.response?.data?.message || err.message || 'Failed to create repo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="repo-card">
      <form onSubmit={handleSubmit}>
        <label>
          Git URL
          <input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/org/repo" />
        </label>
        <label>
          Local path
          <input value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/Users/me/code/project" />
        </label>
        <label>
          Name (optional)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-repo" />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Working…' : 'Index repository'}</button>
      </form>
      {message && <p className="note">{message}</p>}
      <style jsx>{`
        .repo-card { display: flex; flex-direction: column; gap: 1rem; }
        form { display: grid; gap: 0.75rem; }
        label { display: grid; gap: 0.4rem; color: #cbd5e1; font-size: 0.9rem; }
        input { width: 100%; padding: 0.7rem 0.85rem; border-radius: 0.6rem; border: 1px solid #334155; background: #0f172a; color: white; }
        button { padding: 0.8rem 1rem; background: #2563eb; border: none; border-radius: 999px; color: white; cursor: pointer; }
        button:disabled { opacity: 0.6; cursor: progress; }
        .note { color: #94a3b8; font-size: 0.9rem; }
      `}</style>
    </div>
  );
}
