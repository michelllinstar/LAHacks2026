'use client';
import { Info, Zap, Globe, Sparkles, TrendingUp } from 'lucide-react';
import { useState } from 'react';

export function CloudinaryInfo() {
  const [isExpanded, setIsExpanded] = useState(false);

  const features = [
    {
      icon: Sparkles,
      title: 'f_auto (Auto Format)',
      description: 'Cloudinary\'s AI automatically serves the best image format (WebP, AVIF, PNG, SVG) based on the browser\'s capabilities.',
      benefit: '~40% smaller file sizes without quality loss',
      color: 'purple',
    },
    {
      icon: TrendingUp,
      title: 'q_auto (Quality Optimization)',
      description: 'AI analyzes each image and applies optimal compression while maintaining visual quality.',
      benefit: 'Additional 30-50% size reduction',
      color: 'blue',
    },
    {
      icon: Zap,
      title: 'Responsive Sizing (w_800, c_fit)',
      description: 'Dynamic resizing ensures images fit perfectly on any device without manual processing.',
      benefit: 'Faster mobile load times',
      color: 'yellow',
    },
    {
      icon: Globe,
      title: 'Global CDN Delivery',
      description: 'Automatic edge caching across 290+ global data centers ensures fast delivery worldwide.',
      benefit: '3-10x faster load times',
      color: 'green',
    },
  ];

  const colorClasses = {
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    green: 'bg-green-50 border-green-200 text-green-700',
  };

  const iconColorClasses = {
    purple: 'text-purple-600',
    blue: 'text-blue-600',
    yellow: 'text-yellow-600',
    green: 'text-green-600',
  };

  return (
    <div className="mt-8 border rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-blue-600" />
          <div className="text-left">
            <h3 className="font-semibold">Why Cloudinary?</h3>
            <p className="text-sm text-gray-600">Learn about the media optimization happening behind the scenes</p>
          </div>
        </div>
        <div className="text-sm text-blue-600 font-medium">
          {isExpanded ? 'Hide Details' : 'Show Details'}
        </div>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          <div className="h-px bg-gradient-to-r from-blue-200 to-indigo-200 mb-6" />

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className={`p-4 border rounded-lg ${colorClasses[feature.color as keyof typeof colorClasses]}`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${iconColorClasses[feature.color as keyof typeof iconColorClasses]}`} />
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">{feature.title}</h4>
                      <p className="text-sm mb-2">{feature.description}</p>
                      <div className="text-xs font-medium bg-white/60 px-2 py-1 rounded inline-block">
                        ✨ {feature.benefit}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* URL Example */}
          <div className="mt-6 p-4 bg-white rounded-lg border">
            <h4 className="font-semibold mb-3 text-sm">Example Transformation URL</h4>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-start gap-2">
                <span className="text-gray-500 min-w-[60px]">Base:</span>
                <code className="bg-gray-100 px-2 py-1 rounded flex-1">
                  https://res.cloudinary.com/demo/image/upload/
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 min-w-[60px]">Transforms:</span>
                <code className="bg-blue-100 px-2 py-1 rounded flex-1 text-blue-700">
                  f_auto,q_auto,w_800,h_600,c_fit/
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 min-w-[60px]">Asset:</span>
                <code className="bg-gray-100 px-2 py-1 rounded flex-1">
                  diagrams/architecture.svg
                </code>
              </div>
            </div>
          </div>

          {/* Performance Stats */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="p-3 bg-white rounded-lg border text-center">
              <div className="font-bold text-green-600">70%</div>
              <div className="text-xs text-gray-600">Smaller Files</div>
            </div>
            <div className="p-3 bg-white rounded-lg border text-center">
              <div className="font-bold text-blue-600">3-10x</div>
              <div className="text-xs text-gray-600">Faster Loading</div>
            </div>
            <div className="p-3 bg-white rounded-lg border text-center">
              <div className="font-bold text-purple-600">$0</div>
              <div className="text-xs text-gray-600">Backend Costs</div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg text-white">
            <h4 className="font-semibold mb-2">Get Started with Cloudinary</h4>
            <p className="text-sm mb-3 text-blue-100">
              Sign up for free and get 25GB storage + 25GB monthly bandwidth at no cost.
            </p>
            <a
              href="https://cloudinary.com/users/register/free"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
            >
              Create Free Account →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
