'use client';
import { ArrowRight, Sparkles, Zap, Shield, Code2, GitBranch, Users, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { GlassBubble } from '../ui/glass-bubble';
import { AnimatedLogo } from '../ui/AnimatedLogo';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#1e1e1e] aurora-bg">
      {/* Hero Section - Adobe Cloud Style */}
      <div className="relative overflow-hidden aurora-bg">
        {/* Background gradient — kept neutral; aurora handles the motion accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }} />

        {/* Top Navigation */}
        <nav className="relative z-10 border-b border-gray-800 bg-[#1e1e1e]/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                <AnimatedLogo size={44} />
                <div>
                  <h1 className="font-bold text-white text-xl">MarkCodePolo</h1>
                  <p className="text-xs text-gray-400">Visualize your codebase</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
                <Link
                  href="/login?mode=signin"
                  className="px-5 py-2 text-gray-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link href="/login?mode=signup" className="group">
                  <GlassBubble tone="blue" size="sm">
                    Get Started
                  </GlassBubble>
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-5 pt-12 pb-12">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-5 px-5 py-2 bg-white/[0.03] border border-white/10 rounded-full mb-8 anim-fade-up anim-breathe">
              <Sparkles className="h-4 w-4 text-white/80" />
              <span className="text-base text-white/80">AI-powered code visualization</span>
            </div>

            <h2 className="text-6xl font-bold text-white mb-6 leading-tight anim-fade-up-delay-1">
              Transform Code into
              <span
                className="bg-clip-text text-transparent anim-gradient-text"
                style={{
                  backgroundImage:
                    'linear-gradient(110deg, #ffffff 0%, #B7553A 50%, #ffffff 100%)',
                }}
              > Beautiful Architecture</span>
            </h2>

            <p className="text-2xl text-gray-300 mb-10 leading-relaxed anim-fade-up-delay-2">
              AI-powered UML diagrams from your codebase. Connect GitHub, visualize architecture,
              and collaborate with your team — all in one place.
            </p>

            <div className="flex items-center justify-center gap-5 anim-fade-up-delay-3">
              <Link
                href="/login?mode=signup"
                className="hover-glow px-10 py-5 bg-white/[0.04] border border-white/10 text-white font-semibold rounded-xl transition-all flex items-center gap-5"
              >
                Start
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#demo"
                className="glass-card px-10 py-5 text-white font-semibold rounded-xl"
              >
                Watch Demo
              </a>
            </div>

            <p className="text-base text-gray-500 mt-6">
              Free forever for individuals • No credit card required
            </p>
          </div>

          {/* Hero Image/Demo */}
          <div className="mt-16 relative anim-float">
            <div className="absolute inset-0 bg-gradient-to-t from-[#1e1e1e] via-transparent to-transparent z-10 pointer-events-none" />
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="bg-[#1e1e1e] px-5 py-3 border-b border-gray-800 flex items-center gap-5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              {/* Workspace snapshot — a static mock of the Cartographer UI:
                  activity bar on the left, a layered class diagram in the
                  middle, and an agent-activity panel on the right. The
                  geometry mirrors the real workspace so the hero reads as a
                  preview of what the user will see after signing in. */}
              <div className="bg-[#1a1a1a] flex" style={{ height: 420 }}>
                {/* Activity bar */}
                <div className="w-12 bg-[#2d2d2d] border-r border-[#1e1e1e] flex flex-col items-center py-3 gap-4 flex-shrink-0">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={`w-6 h-6 rounded ${i === 0 ? 'bg-white/10' : 'bg-white/5'}`} />
                  ))}
                </div>

                {/* Sidebar — explorer + layer legend */}
                <div className="hidden sm:flex w-44 bg-[#252526] border-r border-[#1e1e1e] flex-col py-3 px-2 gap-1.5 flex-shrink-0">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 px-1 mb-1">Explorer</div>
                  {['src/api', 'src/services', 'src/models', 'src/db', 'tests/'].map((p) => (
                    <div key={p} className="text-[11px] text-gray-300 px-1 py-0.5 truncate">{p}</div>
                  ))}
                  <div className="mt-3 text-[10px] uppercase tracking-wider text-gray-500 px-1 mb-1">Layers</div>
                  {[
                    ['Controller', '#5EEAD4'],
                    ['Service', '#34D399'],
                    ['Repository', '#FBBF24'],
                    ['Entity', '#F59E0B'],
                  ].map(([label, color]) => (
                    <div key={label} className="flex items-center gap-2 px-1 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color as string }} />
                      <span className="text-[11px] text-gray-300">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Diagram canvas — four stacked layer boxes with dashed
                    UML dependency arrows running top-to-bottom, plus an
                    «HTTP» inbound stub from the frontend tier and an «SQL»
                    outbound stub to the database tier. */}
                <div className="flex-1 relative bg-[#1a1a1a]">
                  <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full">
                    <defs>
                      <marker id="hero-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                        <path d="M0 0 L9 5 L0 10" fill="none" stroke="#9ca3af" strokeWidth="1.4" />
                      </marker>
                      <marker id="hero-arrow-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                        <path d="M0 0 L9 5 L0 10" fill="none" stroke="#FBBF24" strokeWidth="1.4" />
                      </marker>
                    </defs>

                    {/* Frontend tier stub */}
                    <rect x="240" y="6" width="120" height="22" rx="4" fill="#1e1e1e" stroke="#FBBF24" strokeDasharray="4 3" strokeWidth="1" />
                    <text x="300" y="21" textAnchor="middle" fontSize="9" fill="#FBBF24" fontFamily="ui-monospace, Menlo">FRONTEND</text>
                    <line x1="300" y1="28" x2="300" y2="60" stroke="#FBBF24" strokeWidth="1.4" strokeDasharray="4 3" markerEnd="url(#hero-arrow-amber)" />
                    <rect x="280" y="38" width="40" height="14" rx="7" fill="#1e1e1e" stroke="#FBBF24" strokeWidth="1" />
                    <text x="300" y="48" textAnchor="middle" fontSize="9" fill="#fde68a" fontStyle="italic" fontFamily="ui-monospace, Menlo">«HTTP»</text>

                    {/* 4 layer boxes */}
                    {[
                      { y: 65,  label: 'Controller', tone: '#5EEAD4', count: 4 },
                      { y: 145, label: 'Service',    tone: '#34D399', count: 7 },
                      { y: 225, label: 'Repository', tone: '#FBBF24', count: 5 },
                      { y: 305, label: 'Entity',     tone: '#F59E0B', count: 9 },
                    ].map((row) => (
                      <g key={row.label}>
                        <rect x="170" y={row.y} width="260" height="60" rx="10" fill={`${row.tone}1A`} stroke={`${row.tone}aa`} strokeWidth="1.4" />
                        <text x="300" y={row.y + 20} textAnchor="middle" fontSize="11" fill={row.tone} fontStyle="italic" fontFamily="ui-monospace, Menlo">«layer»</text>
                        <text x="300" y={row.y + 39} textAnchor="middle" fontSize="14" fill="#fff" fontWeight="700">{row.label}</text>
                        <text x="300" y={row.y + 53} textAnchor="middle" fontSize="9" fill="#9ca3af">{row.count} classes</text>
                      </g>
                    ))}

                    {/* Top-to-bottom dashed dependency arrows (UML dependency notation) */}
                    {[125, 205, 285].map((y) => (
                      <line key={y} x1="300" y1={y} x2="300" y2={y + 20} stroke="#9ca3af" strokeWidth="1.3" strokeDasharray="5 4" markerEnd="url(#hero-arrow)" />
                    ))}

                    {/* Database tier stub off the Repository row */}
                    <line x1="430" y1="255" x2="510" y2="255" stroke="#FBBF24" strokeWidth="1.4" strokeDasharray="4 3" markerEnd="url(#hero-arrow-amber)" />
                    <rect x="448" y="246" width="44" height="16" rx="8" fill="#1e1e1e" stroke="#FBBF24" strokeWidth="1" />
                    <text x="470" y="257" textAnchor="middle" fontSize="9" fill="#fde68a" fontStyle="italic" fontFamily="ui-monospace, Menlo">«SQL»</text>
                    <rect x="510" y="237" width="80" height="36" rx="6" fill="#1e1e1e" stroke="#FBBF24" strokeWidth="1" strokeDasharray="4 3" />
                    <text x="550" y="259" textAnchor="middle" fontSize="9" fill="#FBBF24" fontFamily="ui-monospace, Menlo">DATABASE</text>
                  </svg>
                </div>

                {/* Right panel — agent activity */}
                <div className="hidden md:flex w-48 bg-[#252526] border-l border-[#1e1e1e] flex-col py-3 px-2 gap-2 flex-shrink-0">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 px-1 mb-1">Agent Activity</div>
                  {[
                    { agent: 'Coordinator', text: 'find_relevant_context' },
                    { agent: 'Flow Analyst', text: 'trace UserService → DB' },
                    { agent: 'Inv. Reporter', text: 'order.total ≥ 0' },
                  ].map((a) => (
                    <div key={a.agent} className="rounded border border-white/10 bg-white/[0.03] p-2">
                      <div className="text-[10px] text-[#5EEAD4] font-semibold">{a.agent}</div>
                      <div className="text-[10px] text-gray-300 truncate">{a.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="py-12 bg-[#1a1a1a]">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-16">
            <h3 className="text-4xl font-bold text-white mb-5">Everything you need</h3>
            <p className="text-2xl text-gray-400">
              Professional tools for modern development teams
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Sparkles,
                title: 'AI-Powered Analysis',
                description: 'Smart detection of classes, functions, and relationships',
                color: 'from-[#34D399] to-cyan-500',
              },
              {
                icon: GitBranch,
                title: 'GitHub Integration',
                description: 'Connect repositories for automatic syncing',
                color: 'from-purple-500 to-pink-500',
              },
              {
                icon: Users,
                title: 'Team Collaboration',
                description: 'Share projects with role-based access control',
                color: 'from-green-500 to-emerald-500',
              },
              {
                icon: Zap,
                title: 'Lightning Fast',
                description: 'Generate diagrams in seconds with AI',
                color: 'from-yellow-500 to-orange-500',
              },
              {
                icon: Shield,
                title: 'Enterprise Security',
                description: 'SOC 2 compliant with SSO support',
                color: 'from-indigo-500 to-purple-500',
              },
              {
                icon: TrendingUp,
                title: 'Version History',
                description: 'Track changes alongside your codebase',
                color: 'from-pink-500 to-rose-500',
              },
              {
                icon: Code2,
                title: 'Multi-Language',
                description: 'Support for JS, Python, Java, Go, and more',
                color: 'from-cyan-500 to-blue-500',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="glass-card p-8 rounded-2xl group"
              >
                <div className="w-14 h-14 rounded-xl bg-white/[0.03] border border-white/10 p-3 mb-6 group-hover:scale-110 group-hover:rotate-3 group-hover:border-white/30 group-hover:shadow-[0_0_24px_rgba(255,255,255,0.18)] transition-all duration-300">
                  <feature.icon className="h-full w-full text-white/80 group-hover:text-white transition-colors" />
                </div>
                <h4 className="font-semibold text-white mb-3 text-lg">{feature.title}</h4>
                <p className="text-base text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="py-10">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { value: '10K+', label: 'Developers' },
              { value: '500K+', label: 'Diagrams Generated' },
              { value: '99.9%', label: 'Uptime SLA' },
              { value: '70%', label: 'Faster Loading' },
            ].map((stat) => (
              <div key={stat.label} className="text-center group">
                <div className="text-5xl font-bold text-white mb-5 transition-all duration-300 group-hover:text-[#B7553A] group-hover:[text-shadow:_0_0_24px_rgba(255,255,255,0.25)]">
                  {stat.value}
                </div>
                <div className="text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="pt-10 pb-8 aurora-bg">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h3 className="text-3xl font-bold text-white mb-3">
            Ready to visualize your architecture?
          </h3>
          <p className="text-lg text-gray-300 mb-5">
            Join thousands of developers who trust MarkCodePolo for their documentation needs.
          </p>
          <Link href="/login?mode=signup" className="group inline-block">
            <GlassBubble tone="blue" size="lg" className="font-semibold">
              Get Started Free
              <ArrowRight className="h-5 w-5" />
            </GlassBubble>
          </Link>
        </div>
      </div>

    </div>
  );
}
