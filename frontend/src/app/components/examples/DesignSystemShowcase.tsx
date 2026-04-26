'use client';
/**
 * Adobe Design System Showcase Component
 * Demonstrates all design tokens and patterns
 */

export function DesignSystemShowcase() {
  return (
    <div style={{
      padding: 'var(--adobe-space-8)',
      backgroundColor: 'var(--adobe-bg-base)',
      minHeight: '100vh',
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 'var(--adobe-space-12)' }}>
          <h1 className="adobe-heading-1" style={{ marginBottom: 'var(--adobe-space-4)' }}>
            Adobe Design System
          </h1>
          <p className="adobe-body-large" style={{ color: 'var(--adobe-text-secondary)' }}>
            Comprehensive design tokens for consistent, scalable UI
          </p>
        </div>

        {/* Colors Section */}
        <section style={{ marginBottom: 'var(--adobe-space-12)' }}>
          <h2 className="adobe-heading-2" style={{ marginBottom: 'var(--adobe-space-6)' }}>
            Color System
          </h2>

          {/* Backgrounds */}
          <div style={{ marginBottom: 'var(--adobe-space-6)' }}>
            <h3 className="adobe-heading-3" style={{ marginBottom: 'var(--adobe-space-4)' }}>
              Backgrounds
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--adobe-space-4)' }}>
              {['base', 'layer-1', 'layer-2', 'hover', 'active'].map(bg => (
                <div key={bg} style={{
                  padding: 'var(--adobe-space-4)',
                  backgroundColor: `var(--adobe-bg-${bg})`,
                  border: '1px solid var(--adobe-border-default)',
                  borderRadius: 'var(--adobe-radius-lg)',
                  textAlign: 'center',
                }}>
                  <div className="adobe-caption">--adobe-bg-{bg}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Text Colors */}
          <div style={{ marginBottom: 'var(--adobe-space-6)' }}>
            <h3 className="adobe-heading-3" style={{ marginBottom: 'var(--adobe-space-4)' }}>
              Text Colors
            </h3>
            <div style={{
              padding: 'var(--adobe-space-6)',
              backgroundColor: 'var(--adobe-bg-layer-1)',
              borderRadius: 'var(--adobe-radius-xl)',
            }}>
              <p style={{ color: 'var(--adobe-text-primary)', marginBottom: 'var(--adobe-space-2)' }}>
                Primary Text - var(--adobe-text-primary)
              </p>
              <p style={{ color: 'var(--adobe-text-secondary)', marginBottom: 'var(--adobe-space-2)' }}>
                Secondary Text - var(--adobe-text-secondary)
              </p>
              <p style={{ color: 'var(--adobe-text-tertiary)', marginBottom: 'var(--adobe-space-2)' }}>
                Tertiary Text - var(--adobe-text-tertiary)
              </p>
              <p style={{ color: 'var(--adobe-text-quaternary)' }}>
                Quaternary Text - var(--adobe-text-quaternary)
              </p>
            </div>
          </div>

          {/* Brand Colors */}
          <div>
            <h3 className="adobe-heading-3" style={{ marginBottom: 'var(--adobe-space-4)' }}>
              Brand Colors
            </h3>
            <div style={{ display: 'flex', gap: 'var(--adobe-space-4)' }}>
              <div style={{
                flex: 1,
                padding: 'var(--adobe-space-6)',
                background: 'var(--adobe-gradient-primary)',
                borderRadius: 'var(--adobe-radius-xl)',
                color: 'var(--adobe-text-primary)',
                textAlign: 'center',
              }}>
                Primary Gradient
              </div>
              <div style={{
                flex: 1,
                padding: 'var(--adobe-space-6)',
                background: 'var(--adobe-gradient-secondary)',
                borderRadius: 'var(--adobe-radius-xl)',
                color: 'var(--adobe-text-primary)',
                textAlign: 'center',
              }}>
                Secondary Gradient
              </div>
            </div>
          </div>
        </section>

        {/* Typography Section */}
        <section style={{ marginBottom: 'var(--adobe-space-12)' }}>
          <h2 className="adobe-heading-2" style={{ marginBottom: 'var(--adobe-space-6)' }}>
            Typography
          </h2>
          <div style={{
            padding: 'var(--adobe-space-6)',
            backgroundColor: 'var(--adobe-bg-layer-1)',
            borderRadius: 'var(--adobe-radius-xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--adobe-space-4)',
          }}>
            <h1 className="adobe-heading-1">Heading 1 - 60px Bold</h1>
            <h2 className="adobe-heading-2">Heading 2 - 36px Bold</h2>
            <h3 className="adobe-heading-3">Heading 3 - 24px Semibold</h3>
            <p className="adobe-body-large">Body Large - 18px Regular</p>
            <p className="adobe-body">Body - 16px Regular</p>
            <p className="adobe-body-small">Body Small - 14px Regular</p>
            <p className="adobe-caption">Caption - 12px Regular</p>
          </div>
        </section>

        {/* Buttons Section */}
        <section style={{ marginBottom: 'var(--adobe-space-12)' }}>
          <h2 className="adobe-heading-2" style={{ marginBottom: 'var(--adobe-space-6)' }}>
            Buttons
          </h2>
          <div style={{ display: 'flex', gap: 'var(--adobe-space-4)', flexWrap: 'wrap' }}>
            <button className="adobe-btn-primary">
              Primary Button
            </button>
            <button className="adobe-btn-secondary">
              Secondary Button
            </button>
            <button style={{
              padding: 'var(--adobe-button-padding-md)',
              backgroundColor: 'var(--adobe-success-500)',
              color: 'var(--adobe-text-primary)',
              border: 'none',
              borderRadius: 'var(--adobe-button-radius)',
              cursor: 'pointer',
            }}>
              Success Button
            </button>
            <button style={{
              padding: 'var(--adobe-button-padding-md)',
              backgroundColor: 'var(--adobe-error-500)',
              color: 'var(--adobe-text-primary)',
              border: 'none',
              borderRadius: 'var(--adobe-button-radius)',
              cursor: 'pointer',
            }}>
              Error Button
            </button>
          </div>
        </section>

        {/* Cards Section */}
        <section style={{ marginBottom: 'var(--adobe-space-12)' }}>
          <h2 className="adobe-heading-2" style={{ marginBottom: 'var(--adobe-space-6)' }}>
            Cards
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--adobe-space-6)' }}>
            <div className="adobe-card">
              <h3 className="adobe-heading-3" style={{ marginBottom: 'var(--adobe-space-3)' }}>
                Card Title
              </h3>
              <p className="adobe-body">
                This is a card using the adobe-card class with proper spacing and styling.
              </p>
            </div>
            <div className="adobe-card adobe-card-hover">
              <h3 className="adobe-heading-3" style={{ marginBottom: 'var(--adobe-space-3)' }}>
                Hoverable Card
              </h3>
              <p className="adobe-body">
                This card has hover effects applied using adobe-card-hover class.
              </p>
            </div>
          </div>
        </section>

        {/* Spacing Section */}
        <section style={{ marginBottom: 'var(--adobe-space-12)' }}>
          <h2 className="adobe-heading-2" style={{ marginBottom: 'var(--adobe-space-6)' }}>
            Spacing Scale
          </h2>
          <div style={{
            padding: 'var(--adobe-space-6)',
            backgroundColor: 'var(--adobe-bg-layer-1)',
            borderRadius: 'var(--adobe-radius-xl)',
          }}>
            {[1, 2, 3, 4, 6, 8, 12, 16].map(size => (
              <div key={size} style={{ marginBottom: 'var(--adobe-space-4)', display: 'flex', alignItems: 'center', gap: 'var(--adobe-space-4)' }}>
                <div style={{ width: '150px' }} className="adobe-body-small">
                  --adobe-space-{size}
                </div>
                <div style={{
                  width: `calc(var(--adobe-space-${size}) * 4)`,
                  height: 'var(--adobe-space-4)',
                  backgroundColor: 'var(--adobe-blue-500)',
                  borderRadius: 'var(--adobe-radius-sm)',
                }} />
                <span className="adobe-caption">{size * 4}px</span>
              </div>
            ))}
          </div>
        </section>

        {/* Shadows Section */}
        <section style={{ marginBottom: 'var(--adobe-space-12)' }}>
          <h2 className="adobe-heading-2" style={{ marginBottom: 'var(--adobe-space-6)' }}>
            Shadow System
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--adobe-space-6)' }}>
            {['sm', 'md', 'lg', 'xl', '2xl'].map(shadow => (
              <div key={shadow} style={{
                padding: 'var(--adobe-space-6)',
                backgroundColor: 'var(--adobe-bg-layer-1)',
                borderRadius: 'var(--adobe-radius-lg)',
                boxShadow: `var(--adobe-shadow-${shadow})`,
                textAlign: 'center',
              }}>
                <div className="adobe-body-small">shadow-{shadow}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Inputs Section */}
        <section>
          <h2 className="adobe-heading-2" style={{ marginBottom: 'var(--adobe-space-6)' }}>
            Form Elements
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--adobe-space-4)', maxWidth: '500px' }}>
            <input className="adobe-input" placeholder="Adobe input field" />
            <textarea className="adobe-input" placeholder="Adobe textarea" rows={4} />
            <select className="adobe-input">
              <option>Adobe select dropdown</option>
              <option>Option 1</option>
              <option>Option 2</option>
            </select>
          </div>
        </section>
      </div>
    </div>
  );
}
