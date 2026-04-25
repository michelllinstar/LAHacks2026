import { useEffect, useState } from 'react';
import Link from 'next/link';
import RepoConnector from '../components/RepoConnector';
import { listRepos } from '../lib/api';

export default function Dashboard() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRepos();
      setRepos(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load repositories.');
      setRepos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <main className="dashboard-shell">
      <header className="head">
        <h1>Repositories</h1>
        <p>Connect a repository, then browse its symbol, architecture, flow, and invariant maps.</p>
      </header>

      <section className="connector-card">
        <h2>Connect a repository</h2>
        <RepoConnector onCreated={() => refresh()} />
      </section>

      <section className="repo-list">
        <div className="row-head">
          <h2>Indexed repositories</h2>
          <button type="button" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {!loading && repos.length === 0 && !error && (
          <p className="empty">No repositories registered yet.</p>
        )}
        <div className="cards">
          {repos.map((repo) => (
            <article key={repo.hash} className="repo-card">
              <header>
                <h3>{repo.name}</h3>
                <span className={`badge badge-${repo.status}`}>{repo.status}</span>
              </header>
              <p className="hash">{repo.hash}</p>
              {repo.git_url && <p className="meta">{repo.git_url}</p>}
              {repo.local_path && <p className="meta">{repo.local_path}</p>}
              <Link href={`/repo/${repo.hash}`} className="open">Open →</Link>
            </article>
          ))}
        </div>
      </section>

      <style jsx>{`
        .dashboard-shell { padding: 2rem; max-width: 1200px; margin: 0 auto; color: #e2e8f0; }
        .head h1 { margin: 0 0 0.25rem; }
        .head p { color: #94a3b8; margin: 0 0 1.5rem; }
        .connector-card, .repo-list { background: #0f172a; padding: 1.25rem 1.5rem; border-radius: 0.85rem; margin-bottom: 1.5rem; }
        .row-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .row-head h2 { margin: 0; }
        .row-head button { background: #1f2937; color: white; border: 1px solid #334155; border-radius: 0.5rem; padding: 0.4rem 0.8rem; cursor: pointer; }
        .cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
        .repo-card { background: #111827; border: 1px solid #1f2937; border-radius: 0.6rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
        .repo-card header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
        .repo-card h3 { margin: 0; font-size: 1rem; }
        .hash { font-family: ui-monospace, monospace; font-size: 0.75rem; color: #64748b; margin: 0; }
        .meta { font-size: 0.8rem; color: #94a3b8; margin: 0; word-break: break-all; }
        .open { margin-top: 0.5rem; color: #60a5fa; text-decoration: none; }
        .badge { font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: #1f2937; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.04em; }
        .badge-ready { background: #064e3b; color: #6ee7b7; }
        .badge-indexing { background: #1e3a8a; color: #93c5fd; }
        .badge-pending { background: #422006; color: #fbbf24; }
        .badge-stale { background: #4c1d24; color: #fca5a5; }
        .empty, .error { color: #94a3b8; }
        .error { color: #fca5a5; }
        h2 { margin-top: 0; }
      `}</style>
    </main>
  );
}
