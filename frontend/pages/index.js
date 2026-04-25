import Link from 'next/link';

export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Agentverse UML Studio</h1>
        <p>
          Login, connect a local or Git repository, and render large database UML diagrams with Cloudinary.
          Built to demonstrate OmegaClaw / Agentverse orchestration and vector-enhanced assistant workflows.
        </p>
        <div className="actions">
          <Link href="/login">Login</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>
      </section>
      <section className="features">
        <article>
          <h2>Connect Repos</h2>
          <p>Connect a Git repository or upload local schema files to generate UML diagrams.</p>
        </article>
        <article>
          <h2>Cloudinary Rendering</h2>
          <p>Store and render diagram previews using Cloudinary for performant frontend delivery.</p>
        </article>
        <article>
          <h2>Agentverse Integration</h2>
          <p>Invoke a specialist Agentverse capability through OmegaClaw with Chat Protocol support.</p>
        </article>
      </section>
      <style jsx>{`
        .page-shell { padding: 4rem 2rem; max-width: 1080px; margin: 0 auto; }
        .hero { text-align: center; margin-bottom: 4rem; }
        .hero h1 { font-size: 3rem; margin-bottom: 1rem; }
        .hero p { max-width: 720px; margin: 0 auto 2rem; color: #cbd5e1; }
        .actions a { margin: 0 .75rem; padding: .9rem 1.5rem; background: #2563eb; color: white; border-radius: 999px; text-decoration: none; }
        .features { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
        .features article { background: #0f172a; padding: 1.5rem; border-radius: 1rem; }
      `}</style>
    </main>
  );
}
