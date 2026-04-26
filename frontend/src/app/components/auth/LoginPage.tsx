'use client';
import { useState } from 'react';
import { Code2, Mail, Lock, GitBranch, Globe } from 'lucide-react';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Mock login - in production, would call auth API
    setTimeout(() => {
      onLogin();
      setIsLoading(false);
    }, 1000);
  };

  const handleOAuthLogin = (provider: 'github' | 'google') => {
    setIsLoading(true);
    // Mock OAuth flow - in production, would redirect to OAuth provider
    setTimeout(() => {
      onLogin();
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#2d2d2d] to-[#1a1a1a] p-12 flex-col justify-between relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
          }} />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-5 mb-5">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
              <Code2 className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">CodeViz AI</h1>
              <p className="text-gray-400 text-base">Powered by Cloudinary</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-white mb-5">
                Transform Code into
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"> Visual Architecture</span>
              </h2>
              <p className="text-gray-400 text-base">
                AI-powered UML diagrams with Cloudinary optimization. Built for teams that ship fast.
              </p>
            </div>

            <div className="space-y-5">
              {['AI-Powered Analysis', 'Version Control Integration', 'Real-time Collaboration', 'Cloudinary CDN'].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-5 text-gray-300 text-base">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 text-gray-500 text-base">
          © 2026 CodeViz AI • Built with Cloudinary React AI Starter Kit
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-5 flex items-center justify-center gap-5">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Code2 className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">CodeViz AI</h1>
          </div>

          <div className="bg-[#2d2d2d] rounded-xl p-5 border border-gray-800">
            <h2 className="text-2xl font-bold text-white mb-5">
              {isSignup ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="text-gray-400 text-base mb-5">
              {isSignup ? 'Start visualizing your codebase' : 'Sign in to your workspace'}
            </p>

            {/* Social Login */}
            <div className="space-y-5 mb-5">
              <button
                onClick={() => handleOAuthLogin('github')}
                disabled={isLoading}
                className="w-full px-5 py-3 bg-[#24292e] hover:bg-[#2c3237] text-white text-base rounded-lg transition-colors flex items-center justify-center gap-5 border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GitBranch className="h-5 w-5" />
                Continue with GitHub
              </button>
              <button
                onClick={() => handleOAuthLogin('google')}
                disabled={isLoading}
                className="w-full px-5 py-3 bg-white hover:bg-gray-100 text-gray-900 text-base rounded-lg transition-colors flex items-center justify-center gap-5 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </button>
            </div>

            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700" />
              </div>
              <div className="relative flex justify-center text-base">
                <span className="px-5 bg-[#2d2d2d] text-gray-500">or</span>
              </div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-3 py-3 text-base bg-[#1e1e1e] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="you@company.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-3 py-3 text-base bg-[#1e1e1e] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {!isSignup && (
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-700 bg-[#1e1e1e] text-blue-500 focus:ring-blue-500" />
                    <span className="text-base text-gray-400">Remember me</span>
                  </label>
                  <a href="#" className="text-base text-blue-400 hover:text-blue-300">
                    Forgot password?
                  </a>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 text-base bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? 'Signing in...' : (isSignup ? 'Create Account' : 'Sign In')}
              </button>
            </form>

            <div className="mt-5 text-center">
              <span className="text-gray-400 text-base">
                {isSignup ? 'Already have an account?' : "Don't have an account?"}
              </span>
              {' '}
              <button
                onClick={() => setIsSignup(!isSignup)}
                className="text-blue-400 hover:text-blue-300 text-base font-medium"
              >
                {isSignup ? 'Sign In' : 'Sign Up'}
              </button>
            </div>
          </div>

          <p className="text-center text-gray-500 text-base mt-5">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
