import { useState } from 'react';
import axios from 'axios';

export default function AgentverseConsole({ project }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [status, setStatus] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('Querying specialist Agentverse skill...');
    try {
      const response = await axios.post('/api/agentverse', {
        question,
        projectContext: project || { name: 'Agentverse UML Project' }
      });
      setAnswer(response.data.result);
      setStatus('Received response from Agentverse.');
    } catch (error) {
      setStatus('Agentverse query failed.');
    }
  };

  return (
    <section className="agent-console">
      <h2>Agentverse Skill Console</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Ask OmegaClaw / Agentverse
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Describe the UML or database reasoning task..." rows={4} />
        </label>
        <button type="submit">Run specialist skill</button>
      </form>
      <div className="response-panel">
        <p>{status}</p>
        {answer && <pre>{JSON.stringify(answer, null, 2)}</pre>}
      </div>
      <style jsx>{`
        .agent-console { background: #0f172a; padding: 1.5rem; border-radius: 1rem; margin-top: 1.5rem; }
        form { display: grid; gap: 1rem; }
        textarea { width: 100%; resize: vertical; padding: 1rem; border-radius: 1rem; border: 1px solid #334155; background: #020617; color: #e2e8f0; }
        button { width: fit-content; padding: 0.8rem 1.5rem; border-radius: 999px; border: none; background: #2563eb; color: white; cursor: pointer; }
        pre { background: #020617; color: #f8fafc; padding: 1rem; border-radius: 1rem; overflow-x: auto; margin-top: 1rem; }
      `}</style>
    </section>
  );
}
