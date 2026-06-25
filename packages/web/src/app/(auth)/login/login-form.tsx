'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { signInWithPassword } from '@/lib/auth/actions';

export default function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      setMessage({ type: 'error', text: decodeURIComponent(error) });
      window.history.replaceState({}, '', '/login');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const result = await signInWithPassword(email, password);
      if ('error' in result) {
        setMessage({ type: 'error', text: result.error });
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-text-primary">Welcome back</h2>
        <p className="mt-1 text-[13px] text-text-tertiary">
          Sign in to your Inktrade account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full glass rounded-lg px-4 py-2.5 text-[14px] font-mono text-text-primary placeholder:text-text-muted bg-transparent outline-none focus:border-accent/40 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className="w-full glass rounded-lg px-4 py-2.5 pr-10 text-[14px] font-mono text-text-primary placeholder:text-text-muted bg-transparent outline-none focus:border-accent/40 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors text-[11px] font-mono"
              tabIndex={-1}
            >
              {showPassword ? 'hide' : 'show'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`rounded-lg px-4 py-3 text-[13px] font-mono border ${
            message.type === 'success'
              ? 'bg-emerald/10 text-emerald border-emerald/20'
              : 'bg-rose/10 text-rose border-rose/20'
          }`}>
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 rounded-lg bg-accent/15 text-accent-bright text-[13px] font-semibold border border-accent/30 hover:bg-accent/25 disabled:opacity-50 disabled:cursor-default transition-colors"
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="mt-6 text-center text-[12px] text-text-muted">
        Don&apos;t have an account?{' '}
        <a href="/signup" className="font-medium text-accent-bright hover:text-accent transition-colors">
          Sign up
        </a>
      </p>
    </>
  );
}
