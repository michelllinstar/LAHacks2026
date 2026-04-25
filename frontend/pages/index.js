import Link from 'next/link';

export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Codebase Cartographer</h1>
        <p>
          A four-layer semantic index over your source repositories: symbols, data flows,
          architectural conventions, and implicit invariants. Browse the map, watch agents
          query it live, and stop wasting tokens on grep.
        </p>
        <div className="actions">
          <Link href="/dashboard">Browse Repositories</Link>
        </div>
        <p className="subtitle">Open the dashboard to connect a repository or inspect an existing index.</p>
      </section>
      <style jsx>{`
        .page-shell { padding: 4rem 2rem; max-width: 880px; margin: 0 auto; }
        .hero { text-align: center; }
        .hero h1 { font-size: 3rem; margin-bottom: 1rem; }
        .hero p { max-width: 720px; margin: 0 auto 2rem; color: #cbd5e1; line-height: 1.6; }
        .actions a { display: inline-block; margin: 0 .75rem; padding: .9rem 1.5rem; background: #2563eb; color: white; border-radius: 999px; text-decoration: none; }
        .subtitle { margin-top: 2rem; font-size: 0.9rem; color: #64748b; }
      `}</style>
    </main>
  );
}
