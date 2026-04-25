import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { listRepos } from '../lib/api';

export default function RepoSelector({ currentHash }) {
  const router = useRouter();
  const [repos, setRepos] = useState([]);

  useEffect(() => {
    let alive = true;
    listRepos()
      .then((data) => { if (alive) setRepos(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setRepos([]); });
    return () => { alive = false; };
  }, []);

  const handleChange = (e) => {
    const hash = e.target.value;
    if (hash && hash !== currentHash) router.push(`/repo/${hash}`);
  };

  return (
    <select value={currentHash || ''} onChange={handleChange} className="repo-selector">
      {!repos.find((r) => r.hash === currentHash) && currentHash && (
        <option value={currentHash}>{currentHash}</option>
      )}
      {repos.map((r) => (
        <option key={r.hash} value={r.hash}>{r.name} ({r.status})</option>
      ))}
      <style jsx>{`
        .repo-selector {
          background: #0f172a; color: white;
          border: 1px solid #334155; border-radius: 0.5rem;
          padding: 0.4rem 0.6rem; font-size: 0.9rem;
        }
      `}</style>
    </select>
  );
}
