import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import RepoSelector from '../../components/RepoSelector';
import AgentActivityLog from '../../components/AgentActivityLog';
import QueryConsole from '../../components/QueryConsole';
import useGraphStore from '../../lib/graphStore';
import { connectStream } from '../../lib/sseClient';
import { getRepo, getGraph, getIndexStatus } from '../../lib/api';

const SymbolView = dynamic(() => import('../../components/views/SymbolView'), { ssr: false });
const ArchitectureView = dynamic(() => import('../../components/views/ArchitectureView'), { ssr: false });
const FlowView = dynamic(() => import('../../components/views/FlowView'), { ssr: false });
const InvariantView = dynamic(() => import('../../components/views/InvariantView'), { ssr: false });

const TABS = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'flow', label: 'Flow' },
  { key: 'invariant', label: 'Invariant' },
];

export default function RepoPage() {
  const router = useRouter();
  const { hash } = router.query;
  const [activeTab, setActiveTab] = useState('symbol');
  const [repo, setRepo] = useState(null);
  const [error, setError] = useState(null);

  const ensureRepo = useGraphStore((s) => s.ensureRepo);
  const setCurrentRepo = useGraphStore((s) => s.setCurrentRepo);
  const hydrateLayer = useGraphStore((s) => s.hydrateLayer);
  const setIndexStatus = useGraphStore((s) => s.setIndexStatus);
  const indexStatus = useGraphStore((s) => (hash ? s.byRepo[hash]?.indexStatus : null));

  useEffect(() => {
    if (!hash) return undefined;
    let alive = true;
    ensureRepo(hash);
    setCurrentRepo(hash);

    (async () => {
      try {
        const r = await getRepo(hash);
        if (alive) setRepo(r);
      } catch (err) {
        if (alive) setError(err.message || 'Failed to load repo');
      }

      const layers = ['symbol', 'architecture', 'flow', 'invariant'];
      await Promise.all(layers.map(async (layer) => {
        try {
          const proj = await getGraph(hash, layer);
          if (alive) hydrateLayer(hash, layer, proj);
        } catch (_) {
          if (alive) hydrateLayer(hash, layer, { nodes: [], edges: [] });
        }
      }));

      try {
        const status = await getIndexStatus(hash);
        if (alive) setIndexStatus(hash, status);
      } catch (_) {}
    })();

    const teardown = connectStream(hash, useGraphStore.getState());
    return () => {
      alive = false;
      try { teardown(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  const ActiveView = (() => {
    switch (activeTab) {
      case 'architecture': return ArchitectureView;
      case 'flow': return FlowView;
      case 'invariant': return InvariantView;
      case 'symbol':
      default: return SymbolView;
    }
  })();

  return (
    <main className="repo-shell">
      <header className="top-bar">
        <div className="left">
          <Link href="/dashboard" className="back">← Dashboard</Link>
          <RepoSelector currentHash={hash} />
          <span className="repo-name">{repo?.name || (hash ? String(hash) : '…')}</span>
          {repo?.status && <span className={`badge badge-${repo.status}`}>{repo.status}</span>}
        </div>
        <div className="right">
          <IndexStatusChip status={indexStatus} />
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={t.key === activeTab ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(t.key)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="body">
        <section className="main-col">
          <section className="view">
            {error && <p className="error">{error}</p>}
            {hash && <ActiveView repoHash={hash} />}
          </section>
          {hash && <QueryConsole repoHash={hash} />}
        </section>
        <AgentActivityLog repoHash={hash} />
      </div>

      <style jsx>{`
        .repo-shell { display: flex; flex-direction: column; height: 100vh; color: #e2e8f0; background: #020617; }
        .top-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1.25rem; border-bottom: 1px solid #1f2937; background: #0f172a; }
        .left { display: flex; align-items: center; gap: 0.75rem; }
        .back { color: #60a5fa; text-decoration: none; font-size: 0.85rem; }
        .repo-name { font-weight: 600; }
        .badge { font-size: 0.7rem; padding: 0.1rem 0.5rem; border-radius: 999px; background: #1f2937; color: #cbd5e1; text-transform: uppercase; }
        .badge-ready { background: #064e3b; color: #6ee7b7; }
        .badge-indexing { background: #1e3a8a; color: #93c5fd; }
        .badge-pending { background: #422006; color: #fbbf24; }
        .badge-stale { background: #4c1d24; color: #fca5a5; }
        .tabs { display: flex; gap: 0.25rem; padding: 0 1rem; background: #0b1220; border-bottom: 1px solid #1f2937; }
        .tab { background: transparent; border: none; color: #94a3b8; padding: 0.65rem 1rem; cursor: pointer; border-bottom: 2px solid transparent; }
        .tab.active { color: white; border-bottom-color: #60a5fa; }
        .body { flex: 1; display: flex; min-height: 0; }
        .main-col { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
        .view { flex: 1; position: relative; overflow: hidden; min-height: 0; }
        .error { color: #fca5a5; padding: 1rem; }
      `}</style>
    </main>
  );
}

function IndexStatusChip({ status }) {
  if (!status || !status.layers) {
    return <span className="chip muted">No index status</span>;
  }
  const labels = [];
  const order = ['symbol', 'flow', 'architecture', 'invariant'];
  order.forEach((k, i) => {
    const ls = status.layers[k];
    if (ls) labels.push(`L${i + 1}: ${ls.count}`);
  });

  return (
    <span className="chip">
      {labels.join(' · ') || 'idle'}
      <style jsx>{`
        .chip { background: #111827; border: 1px solid #1f2937; padding: 0.3rem 0.7rem; border-radius: 999px; font-size: 0.8rem; color: #cbd5e1; }
        .chip.muted { color: #64748b; }
      `}</style>
    </span>
  );
}
