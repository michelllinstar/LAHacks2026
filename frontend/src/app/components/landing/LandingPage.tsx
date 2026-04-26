'use client';
import { ArrowRight, Sparkles, Zap, Shield, Cloud, Code2, GitBranch, Users, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#1e1e1e]">
      {/* Hero Section - Adobe Cloud Style */}
      <div className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20" />

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
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                  <Code2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="font-bold text-white text-xl">CodeViz AI</h1>
                  <p className="text-xs text-gray-400">Powered by Cloudinary</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
                <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">Pricing</a>
                <a href="#docs" className="text-gray-300 hover:text-white transition-colors">Docs</a>
                <Link
                  href="/login"
                  className="px-5 py-2 text-gray-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/login"
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium rounded-lg transition-all"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-5 pt-20 pb-32">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-5 px-5 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full mb-8">
              <Sparkles className="h-4 w-4 text-blue-400" />
              <span className="text-base text-blue-400">Powered by AI & Cloudinary</span>
            </div>

            <h2 className="text-6xl font-bold text-white mb-6 leading-tight">
              Transform Code into
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"> Beautiful Architecture</span>
            </h2>

            <p className="text-2xl text-gray-300 mb-10 leading-relaxed">
              AI-powered UML diagrams from your codebase. Connect GitHub, visualize architecture,
              and collaborate with your team—all optimized with Cloudinary's global CDN.
            </p>

            <div className="flex items-center justify-center gap-5">
              <Link
                href="/login"
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg transition-all transform hover:scale-105 flex items-center gap-5"
              >
                Start Free Trial
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#demo"
                className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-lg transition-all"
              >
                Watch Demo
              </a>
            </div>

            <p className="text-base text-gray-500 mt-6">
              Free forever for individuals • No credit card required
            </p>
          </div>

          {/* Hero Image/Demo */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-[#1e1e1e] via-transparent to-transparent z-10 pointer-events-none" />
            <div className="bg-[#2d2d2d] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
              <div className="bg-[#1e1e1e] px-5 py-3 border-b border-gray-800 flex items-center gap-5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
                <div className="grid grid-cols-2 gap-6 opacity-80">
                  <div className="space-y-5">
                    <div className="h-4 bg-blue-500/30 rounded w-3/4" />
                    <div className="h-4 bg-purple-500/30 rounded w-full" />
                    <div className="h-4 bg-pink-500/30 rounded w-5/6" />
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center">
                      <Sparkles className="h-12 w-12 text-gray-600" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="py-24 bg-[#1a1a1a]">
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
                color: 'from-blue-500 to-cyan-500',
              },
              {
                icon: GitBranch,
                title: 'GitHub Integration',
                description: 'Connect repositories for automatic syncing',
                color: 'from-purple-500 to-pink-500',
              },
              {
                icon: Cloud,
                title: 'Cloudinary CDN',
                description: 'Global delivery with f_auto, q_auto optimization',
                color: 'from-orange-500 to-red-500',
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
                className="p-6 bg-[#2d2d2d] rounded-xl border border-gray-800 hover:border-gray-700 transition-all group"
              >
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${feature.color} p-3 mb-5 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="h-full w-full text-white" />
                </div>
                <h4 className="font-semibold text-white mb-5">{feature.title}</h4>
                <p className="text-base text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { value: '10K+', label: 'Developers' },
              { value: '500K+', label: 'Diagrams Generated' },
              { value: '99.9%', label: 'Uptime SLA' },
              { value: '70%', label: 'Faster Loading' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-5">
                  {stat.value}
                </div>
                <div className="text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-24 bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-pink-600/10">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h3 className="text-4xl font-bold text-white mb-6">
            Ready to visualize your architecture?
          </h3>
          <p className="text-2xl text-gray-300 mb-10">
            Join thousands of developers who trust CodeViz AI for their documentation needs.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-5 px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg transition-all transform hover:scale-105"
          >
            Get Started Free
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-5 mb-5">
                <div className="p-1.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded">
                  <Code2 className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-white">CodeViz AI</span>
              </div>
              <p className="text-base text-gray-400">
                Transform code into beautiful architecture diagrams with AI.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-5">Product</h4>
              <ul className="space-y-2 text-base text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Changelog</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-5">Resources</h4>
              <ul className="space-y-2 text-base text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Examples</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-5">Company</h4>
              <ul className="space-y-2 text-base text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-12 pt-8 flex items-center justify-between text-base text-gray-400">
            <p>© 2026 CodeViz AI. Built with Cloudinary React AI Starter Kit.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Security</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
