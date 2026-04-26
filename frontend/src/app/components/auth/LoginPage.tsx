'use client';
import { useState } from 'react';
import { Code2, Mail, Lock, GitBranch, Globe, ShieldCheck, ArrowLeft } from 'lucide-react';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { login } from '../../../lib/api';
import { AnimatedLogo } from '../ui/AnimatedLogo';

interface LoginPageProps {
  onLogin: () => void;
}

type SignupStep = 'form' | 'verify';

// Demo email-verification: no real SMTP wired yet, so we generate the code
// client-side and surface it via toast. Swap `sendVerificationCode` for a
// real backend endpoint when one exists.
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [signupStep, setSignupStep] = useState<SignupStep>('form');
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const startCooldown = () => {
    setResendCooldown(30);
    const tick = () => {
      setResendCooldown((prev) => {
        if (prev <= 1) return 0;
        setTimeout(tick, 1000);
        return prev - 1;
      });
    };
    setTimeout(tick, 1000);
  };

  const sendVerificationCode = async (toEmail: string) => {
    const code = generateCode();
    setIssuedCode(code);
    startCooldown();
    // Demo: surface the code in the toast since no SMTP is configured.
    toast.success(`Verification code sent to ${toEmail}`, {
      description: `Demo code: ${code}`,
      duration: 10000,
    });
  };

  const switchMode = (signup: boolean) => {
    setIsSignup(signup);
    setSignupStep('form');
    setPassword('');
    setConfirmPassword('');
    setCodeInput('');
    setIssuedCode(null);
  };

  const errorFromAxios = (err: unknown, fallback: string): string => {
    if (err instanceof AxiosError) {
      const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
      return detail || err.message || fallback;
    }
    return fallback;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignup) {
      if (password.length < 8) {
        toast.error('Password too short', {
          description: 'Use at least 8 characters.',
        });
        return;
      }
      if (password !== confirmPassword) {
        toast.error('Passwords don\u2019t match', {
          description: 'Make sure both fields are identical.',
        });
        return;
      }
      setIsLoading(true);
      try {
        await sendVerificationCode(email);
        setSignupStep('verify');
      } finally {
        setIsLoading(false);
      }
      return;
    }
    setIsLoading(true);
    try {
      await login(email, password);
      onLogin();
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        toast.error('Sign-in failed', {
          description: 'Email or password is incorrect.',
        });
      } else {
        toast.error('Sign-in failed', {
          description: errorFromAxios(err, 'Please try again.'),
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codeInput.trim() !== issuedCode) {
      toast.error('Incorrect code', {
        description: 'Double-check the 6-digit code from your email.',
      });
      return;
    }
    setIsLoading(true);
    try {
      // Demo: backend signup endpoint isn't implemented, so we attempt a
      // login with the entered credentials. Replace with a real `signup`
      // call once the API exists.
      await login(email, password);
      toast.success('Account verified', {
        description: 'Welcome to MarkCodePolo.',
      });
      onLogin();
    } catch (err: unknown) {
      toast.error('Could not finalize signup', {
        description: errorFromAxios(err, 'Please try again.'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    await sendVerificationCode(email);
  };

  const handleOAuthLogin = (provider: 'github' | 'google') => {
    toast.info('OAuth not configured yet — sign in with email/password');
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex aurora-bg">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#2d2d2d] to-[#1a1a1a] p-12 flex-col items-center justify-center relative overflow-hidden anim-fade-up">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
          }} />
        </div>

        <div className="relative z-10 max-w-md text-center">
          <div className="flex items-center justify-center gap-5 mb-5">
            <AnimatedLogo size={64} />
            <div className="text-left">
              <h1 className="text-2xl font-bold text-white">MarkCodePolo</h1>
              <p className="text-gray-400 text-base">Powered by Cloudinary</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-white mb-5">
                <span className="anim-word-reveal" style={{ ['--d' as string]: '0.05s' } as React.CSSProperties}>Transform</span>{' '}
                <span className="anim-word-reveal" style={{ ['--d' as string]: '0.18s' } as React.CSSProperties}>Code</span>{' '}
                <span className="anim-word-reveal" style={{ ['--d' as string]: '0.31s' } as React.CSSProperties}>into</span>{' '}
                <span
                  className="bg-clip-text text-transparent anim-sheen-reveal"
                  style={{
                    backgroundImage:
                      'linear-gradient(110deg, #ffffff 0%, #B7553A 50%, #ffffff 100%)',
                    ['--d' as string]: '0.5s',
                  } as React.CSSProperties}
                >Visual Architecture</span>
              </h2>
              <p className="text-gray-400 text-base">
                AI-powered UML diagrams with Cloudinary optimization. Built for teams that ship fast.
              </p>
            </div>

            <div className="flex justify-center">
              <div className="space-y-3 text-left">
                {['AI-Powered Analysis', 'Version Control Integration', 'Real-time Collaboration', 'Cloudinary CDN'].map((feature) => (
                  <div key={feature} className="flex items-center gap-3 text-gray-300 text-base">
                    <div className="w-1.5 h-1.5 bg-[#B7553A] rounded-full" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-0 right-0 z-10 text-center text-gray-500 text-sm px-12">
          © 2026 MarkCodePolo • Built with Cloudinary React AI Starter Kit
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg anim-fade-up-delay-1">
          <div className="lg:hidden mb-6 flex items-center justify-center gap-5">
            <AnimatedLogo size={40} />
            <h1 className="text-2xl font-bold text-white">MarkCodePolo</h1>
          </div>

          <div className="glass-panel rounded-2xl p-8">
            {isSignup && signupStep === 'verify' ? (
              <button
                type="button"
                onClick={() => setSignupStep('form')}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors mb-3"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : null}
            <h2 className="text-2xl font-bold text-white mb-5 text-center">
              {isSignup
                ? signupStep === 'verify'
                  ? 'Verify your email'
                  : 'Create Account'
                : 'Welcome Back'}
            </h2>
            <p className="text-gray-400 text-base mb-5 text-center">
              {isSignup
                ? signupStep === 'verify'
                  ? `Enter the 6-digit code sent to ${email}`
                  : 'Start visualizing your codebase'
                : 'Sign in to your workspace'}
            </p>

            {!(isSignup && signupStep === 'verify') && (<>
            {/* Social Login */}
            <div className="space-y-5 mb-5 flex flex-col items-stretch w-full">
              <button
                onClick={() => handleOAuthLogin('github')}
                disabled={isLoading}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
                  e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
                }}
                className="relative overflow-hidden flex w-full px-8 py-5 text-white text-lg font-medium rounded-xl transition-all items-center justify-center gap-3 border border-white/15 hover:border-white/25 disabled:opacity-50 disabled:cursor-not-allowed group"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.10)',
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{
                    background:
                      'radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.16), transparent 60%)',
                  }}
                />
                <GitBranch className="h-6 w-6 relative" />
                <span className="relative">Continue with GitHub</span>
              </button>
              <button
                onClick={() => handleOAuthLogin('google')}
                disabled={isLoading}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
                  e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
                }}
                className="relative overflow-hidden flex w-full px-8 py-5 text-white text-lg font-medium rounded-xl transition-all items-center justify-center gap-3 border border-white/15 hover:border-white/25 disabled:opacity-50 disabled:cursor-not-allowed group"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.10)',
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{
                    background:
                      'radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.16), transparent 60%)',
                  }}
                />
                <svg className="h-6 w-6 relative" viewBox="0 0 24 24" role="img" aria-label="Google">
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
                <span className="relative">Continue with Google</span>
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
                <div className="glass-input flex items-center gap-3 rounded-xl px-5 py-4">
                  <Mail className="h-5 w-5 text-gray-500 flex-shrink-0" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-base text-white placeholder-gray-500 focus:outline-none"
                    placeholder="you@company.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">
                  Password
                </label>
                <div className="glass-input flex items-center gap-3 rounded-xl px-5 py-4">
                  <Lock className="h-5 w-5 text-gray-500 flex-shrink-0" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-base text-white placeholder-gray-500 focus:outline-none"
                    placeholder="••••••••"
                    required
                    minLength={isSignup ? 8 : undefined}
                  />
                </div>
                {isSignup && (
                  <p className="text-xs text-gray-500 mt-1">At least 8 characters</p>
                )}
              </div>

              {isSignup && (
                <div>
                  <label className="block text-base font-medium text-gray-300 mb-2">
                    Confirm Password
                  </label>
                  <div className="glass-input flex items-center gap-3 rounded-xl px-5 py-4">
                    <Lock className="h-5 w-5 text-gray-500 flex-shrink-0" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-base text-white placeholder-gray-500 focus:outline-none"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                  {confirmPassword.length > 0 && confirmPassword !== password && (
                    <p className="text-xs text-red-400 mt-1">Passwords don&apos;t match</p>
                  )}
                </div>
              )}

              {!isSignup && (
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-700 bg-[#1e1e1e] text-white focus:ring-[#2DD4BF]" />
                    <span className="text-base text-gray-400">Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => toast.info('Password reset coming soon')}
                    className="text-base text-[#5EEAD4] hover:text-[#5EEAD4]"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="hover-glow w-full py-6 text-lg bg-white/[0.04] border border-white/10 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading
                  ? (isSignup ? 'Sending code...' : 'Signing in...')
                  : (isSignup ? 'Send Verification Code' : 'Sign In')}
              </button>
            </form>
            </>)}

            {isSignup && signupStep === 'verify' && (
              <form onSubmit={handleVerifySubmit} className="space-y-5">
                <div>
                  <label className="block text-base font-medium text-gray-300 mb-2">
                    Verification Code
                  </label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      autoFocus
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                        backdropFilter: 'blur(14px)',
                        WebkitBackdropFilter: 'blur(14px)',
                        boxShadow: '0 4px 18px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.10)',
                      }}
                      className="w-full pl-14 pr-4 py-3 text-2xl tracking-[0.5em] font-mono border border-white/15 rounded-lg text-white text-center placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]/40 focus:border-[#2DD4BF]/60 transition-colors"
                      placeholder="••••••"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Didn&apos;t get the code?</span>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    className="text-sm text-[#5EEAD4] hover:text-[#5EEAD4] disabled:text-gray-500 disabled:cursor-not-allowed"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || codeInput.length !== 6}
                  className="hover-glow w-full py-6 text-lg bg-white/[0.04] border border-white/10 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Verifying...' : 'Verify & Create Account'}
                </button>
              </form>
            )}

            <div className="mt-5 text-center">
              <span className="text-gray-400 text-base">
                {isSignup ? 'Already have an account?' : "Don't have an account?"}
              </span>
              {' '}
              <button
                onClick={() => switchMode(!isSignup)}
                className="text-[#5EEAD4] hover:text-[#5EEAD4] text-base font-medium"
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
