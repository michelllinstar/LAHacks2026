import { useState } from 'react';

/**
 * Pure render component for a Region or cluster metadata.
 *
 * Accepts either:
 *   - the `cluster` shape returned by /api/query/describe_architecture
 *     ({ cluster_id, role, conventions: { naming, code_shape }, dependencies })
 *   - or a flattened metadata snapshot from a Layer 3 GraphNode
 *     ({ cluster_id, role|role_description, naming_convention, code_shape, dependencies })
 *
 * Defensively handles partial data — heuristic clusters often only have a
 * naming convention, no LLM-derived code shape, etc.
 */
export default function ConventionPanel({ cluster, region, memberFiles, onClose }) {
  // Accept either `cluster` (preferred) or legacy `region` prop name.
  const data = cluster || region;

  if (!data) {
    return (
      <div className="convention-panel empty">
        <p>Select a cluster to inspect its conventions.</p>
        <style jsx>{styles}</style>
      </div>
    );
  }

  const role = data.role || data.role_description || 'Unknown role';
  const conventions = data.conventions || {};
  const naming = conventions.naming || data.naming_convention || null;
  const codeShape = conventions.code_shape || data.code_shape || null;
  const memberCount = data.member_count || (Array.isArray(memberFiles) ? memberFiles.length : null);

  const dependencies = data.dependencies || {};
  const allowed = dependencies.allowed || [];
  const forbidden = dependencies.forbidden || [];

  return (
    <div className="convention-panel">
      <div className="header">
        <h3>{data.cluster_id != null ? truncateId(String(data.cluster_id)) : 'Region'}</h3>
        {onClose && (
          <button className="close" onClick={onClose} aria-label="Close panel" type="button">×</button>
        )}
      </div>

      <Section title="Role">
        <p className="role">{role}</p>
        {memberCount != null && (
          <p className="count">{memberCount} {memberCount === 1 ? 'file' : 'files'}</p>
        )}
      </Section>

      <Section title="Naming convention">
        {naming ? (
          <code className="naming">{naming}</code>
        ) : (
          <p className="muted">No naming convention recorded.</p>
        )}
      </Section>

      <Section title="Code shape">
        <CodeShape shape={codeShape} />
      </Section>

      <Section title="Dependencies">
        <div className="deps">
          <div className="deps-col">
            <h5 className="allowed">Allowed</h5>
            {allowed.length === 0
              ? <p className="muted">None listed.</p>
              : (
                <ul>
                  {allowed.map((c, i) => (
                    <li key={`a-${i}`}><code>{truncateId(String(c))}</code></li>
                  ))}
                </ul>
              )
            }
          </div>
          <div className="deps-col">
            <h5 className="forbidden">Forbidden</h5>
            {forbidden.length === 0
              ? <p className="muted">None listed.</p>
              : (
                <ul>
                  {forbidden.map((c, i) => (
                    <li key={`f-${i}`}><code>{truncateId(String(c))}</code></li>
                  ))}
                </ul>
              )
            }
          </div>
        </div>
      </Section>

      <MembersSection files={memberFiles} />

      <style jsx>{styles}</style>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="sec">
      <h4>{title}</h4>
      {children}
      <style jsx>{`
        .sec { margin-bottom: 0.9rem; }
        h4 {
          margin: 0 0 0.4rem;
          font-size: 0.7rem; color: #93c5fd;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
      `}</style>
    </section>
  );
}

function CodeShape({ shape }) {
  if (!shape) return <p className="muted">No code shape recorded.<style jsx>{`.muted { color: #64748b; font-size: 0.8rem; margin: 0; }`}</style></p>;

  // shape may be { patterns: [...], source: "llm"|"heuristic" } or already an array
  const patterns = Array.isArray(shape) ? shape : (shape.patterns || []);
  const source = !Array.isArray(shape) ? shape.source : null;

  if (!patterns.length) {
    return (
      <p className="muted">No patterns extracted{source === 'heuristic' ? ' (heuristic)' : ''}.
        <style jsx>{`.muted { color: #64748b; font-size: 0.8rem; margin: 0; }`}</style>
      </p>
    );
  }

  return (
    <div>
      <ul className="patterns">
        {patterns.map((p, i) => (
          <li key={i}>{typeof p === 'string' ? p : JSON.stringify(p)}</li>
        ))}
      </ul>
      {source === 'heuristic' && <span className="src">(heuristic)</span>}
      <style jsx>{`
        .patterns { list-style: disc; padding-left: 1.1rem; margin: 0; font-size: 0.8rem; color: #cbd5e1; }
        .patterns li { margin: 0.15rem 0; }
        .src { color: #64748b; font-size: 0.7rem; font-style: italic; margin-left: 0.3rem; }
      `}</style>
    </div>
  );
}

function MembersSection({ files }) {
  const [open, setOpen] = useState(false);
  if (!Array.isArray(files) || files.length === 0) return null;

  return (
    <section className="sec">
      <button
        type="button"
        className="toggle"
        onClick={() => setOpen((o) => !o)}
      >
        <span>Members ({files.length})</span>
        <span className="caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="files">
          {files.map((f, i) => (
            <li key={i}><code>{f}</code></li>
          ))}
        </ul>
      )}
      <style jsx>{`
        .sec { margin-bottom: 0.9rem; }
        .toggle {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; background: transparent; border: 0;
          color: #93c5fd; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em;
          padding: 0; margin-bottom: 0.4rem; cursor: pointer;
        }
        .caret { color: #64748b; }
        .files {
          list-style: none; padding: 0; margin: 0;
          max-height: 220px; overflow-y: auto;
          background: #0f172a; border-radius: 0.4rem;
          border: 1px solid #1f2937;
        }
        .files li { padding: 0.25rem 0.55rem; font-size: 0.72rem; border-bottom: 1px solid #111827; }
        .files li:last-child { border-bottom: 0; }
        .files code { color: #cbd5e1; }
      `}</style>
    </section>
  );
}

function truncateId(s, max = 12) {
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

const styles = `
  .convention-panel {
    background: #111827; border: 1px solid #1f2937;
    border-radius: 0.5rem; padding: 1rem; color: #e2e8f0;
  }
  .convention-panel.empty { color: #64748b; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
  h3 { margin: 0; font-size: 0.95rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #cbd5e1; }
  .close { background: none; border: 0; color: #94a3b8; font-size: 1.2rem; cursor: pointer; line-height: 1; padding: 0 0.25rem; }
  .role { color: #e2e8f0; font-size: 0.95rem; line-height: 1.35; margin: 0; }
  .count { color: #64748b; font-size: 0.75rem; margin: 0.25rem 0 0; }
  .naming {
    background: #0f172a; padding: 0.25rem 0.5rem;
    border-radius: 0.3rem; border: 1px solid #1f2937;
    color: #fbbf24; font-size: 0.8rem;
    display: inline-block; word-break: break-all;
  }
  .deps { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  .deps-col h5 { margin: 0 0 0.3rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .deps-col h5.allowed { color: #34d399; }
  .deps-col h5.forbidden { color: #f87171; }
  .deps-col ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.2rem; }
  .deps-col li code {
    background: #0f172a; padding: 0.15rem 0.4rem;
    border-radius: 0.25rem; font-size: 0.72rem; color: #cbd5e1;
  }
  .muted { color: #64748b; font-size: 0.8rem; margin: 0; }
`;
