'use client';
import { Zap, Cloud, GitCompare, Share2, Sparkles, TrendingUp } from 'lucide-react';

export function FeatureShowcase() {
  const features = [
    {
      icon: Sparkles,
      title: 'AI Code Analysis',
      description: 'Smart detection of classes, functions, and architectural patterns',
      color: 'purple',
    },
    {
      icon: Zap,
      title: 'Instant UML Generation',
      description: 'Auto-generate class diagrams and flowcharts in seconds',
      color: 'yellow',
    },
    {
      icon: Cloud,
      title: 'Cloudinary CDN',
      description: 'Global delivery with f_auto, q_auto optimization',
      color: 'blue',
    },
    {
      icon: GitCompare,
      title: 'Visual Diff',
      description: 'Compare diagram versions with overlay transformations',
      color: 'indigo',
    },
    {
      icon: Share2,
      title: 'One-Click Sharing',
      description: 'Optimized URLs ready to embed anywhere',
      color: 'green',
    },
    {
      icon: TrendingUp,
      title: 'AI Optimization',
      description: '70% smaller files, 3x faster load times',
      color: 'red',
    },
  ];

  const colorClasses = {
    purple: 'bg-purple-100 text-purple-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    blue: 'bg-blue-100 text-blue-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {features.map((feature, idx) => {
        const Icon = feature.icon;
        return (
          <div key={idx} className="p-6 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 rounded-lg ${colorClasses[feature.color as keyof typeof colorClasses]} flex items-center justify-center mb-3`}>
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold mb-2">{feature.title}</h3>
            <p className="text-sm text-gray-600">{feature.description}</p>
          </div>
        );
      })}
    </div>
  );
}
