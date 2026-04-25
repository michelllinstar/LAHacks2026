export default function ConventionPanel({ region }) {
  if (!region) {
    return (
      <div className="convention-panel empty">
        <p>Select a cluster to inspect its conventions.</p>
        <style jsx>{styles}</style>
      </div>
    );
  }

  const role = region.role || region.role_description || 'Unknown role';
  const conventions = region.conventions || {};
  const deps = region.dependencies || {};
  const allowed = deps.allowed || [];
  const forbidden = deps.forbidden || [];

  return (
    <div className="convention-panel">
      <h3>{region.cluster_id != null ? `Cluster ${region.cluster_id}` : 'Region'}</h3>
      <p className="role">{role}</p>

      <h4>Conventions</h4>
      {Object.keys(conventions).length === 0 ? (
        <p className="muted">No conventions recorded.</p>
      ) : (
        <ul>
          {Object.entries(conventions).map(([k, v]) => (
            <li key={k}><strong>{k}:</strong> {String(v)}</li>
          ))}
        </ul>
      )}

      <h4>Allowed dependencies</h4>
      {allowed.length === 0 ? <p className="muted">None listed.</p> : (
        <ul>{allowed.map((c, i) => <li key={`a-${i}`}>cluster {c}</li>)}</ul>
      )}

      <h4>Forbidden dependencies</h4>
      {forbidden.length === 0 ? <p className="muted">None listed.</p> : (
        <ul>{forbidden.map((c, i) => <li key={`f-${i}`}>cluster {c}</li>)}</ul>
      )}

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .convention-panel { background: #111827; border: 1px solid #1f2937; border-radius: 0.5rem; padding: 1rem; color: #e2e8f0; }
  .convention-panel.empty { color: #64748b; }
  h3 { margin: 0 0 0.5rem; }
  h4 { margin: 0.75rem 0 0.4rem; font-size: 0.85rem; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.05em; }
  ul { margin: 0; padding-left: 1.2rem; font-size: 0.85rem; }
  .role { color: #cbd5e1; font-style: italic; margin: 0 0 0.5rem; }
  .muted { color: #64748b; font-size: 0.85rem; margin: 0; }
`;
