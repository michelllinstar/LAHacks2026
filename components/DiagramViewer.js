import Image from 'next/image';

export default function DiagramViewer({ diagram }) {
  if (!diagram) {
    return (
      <div className="diagram-card">
        <p>No UML diagram selected yet.</p>
      </div>
    );
  }

  return (
    <div className="diagram-card">
      <h2>{diagram.name}</h2>
      <p>{diagram.description}</p>
      <div className="diagram-preview">
        {diagram.cloudinaryUrl ? (
          <Image
            src={diagram.cloudinaryUrl}
            alt={diagram.name}
            width={1200}
            height={700}
            priority
          />
        ) : (
          <div className="diagram-placeholder">No rendered diagram available yet.</div>
        )}
      </div>
      <style jsx>{`
        .diagram-card {
          background: #111827;
          color: #f9fafb;
          border-radius: 1rem;
          padding: 1.5rem;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
        }
        .diagram-preview {
          margin-top: 1rem;
          border-radius: 1rem;
          min-height: 300px;
          border: 1px solid #334155;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f172a;
        }
        .diagram-placeholder {
          color: #94a3b8;
          padding: 2rem;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
