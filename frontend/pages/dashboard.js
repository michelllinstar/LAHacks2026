import { useEffect, useState } from 'react';
import axios from 'axios';
import DiagramViewer from '../components/DiagramViewer';
import RepoConnector from '../components/RepoConnector';
import AgentverseConsole from '../components/AgentverseConsole';

export default function Dashboard() {
  const [project, setProject] = useState(null);
  const [diagrams, setDiagrams] = useState([]);
  const [selectedDiagram, setSelectedDiagram] = useState(null);

  useEffect(() => {
    axios.get('/api/projects').then((res) => {
      setDiagrams(res.data.diagrams || []);
    });
  }, []);

  return (
    <main className="dashboard-shell">
      <section className="dashboard-grid">
        <div className="panel">
          <h2>Repository / Project</h2>
          <RepoConnector onProjectCreated={setProject} />
          <div className="diagram-list">
            <h3>Saved UML diagrams</h3>
            {diagrams.length === 0 ? (
              <p>No diagrams yet. Connect a repo or upload a diagram to begin.</p>
            ) : (
              diagrams.map((diagram) => (
                <button
                  key={diagram._id}
                  type="button"
                  onClick={() => setSelectedDiagram(diagram)}
                >
                  {diagram.name}
                </button>
              ))
            )}
          </div>
        </div>
        <div className="panel wide">
          <DiagramViewer diagram={selectedDiagram} />
        </div>
      </section>
      <AgentverseConsole project={project} />
      <style jsx>{`
        .dashboard-shell { padding: 2rem; max-width: 1220px; margin: 0 auto; }
        .dashboard-grid { display: grid; gap: 1.5rem; grid-template-columns: 360px minmax(0, 1fr); }
        .panel { background: #111827; padding: 1.5rem; border-radius: 1rem; }
        .wide { min-height: 640px; }
        .diagram-list button { width: 100%; margin-top: 0.75rem; padding: 0.85rem 1rem; border: none; border-radius: 0.85rem; background: #1f2937; color: white; text-align: left; cursor: pointer; }
      `}</style>
    </main>
  );
}
