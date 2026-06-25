'use client';

import { useState } from 'react';
import { signUpWithPassword } from '@/lib/auth/actions';

export default function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const passwordValid = password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
  const passwordsMatch = password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters with a letter and a number.' });
      return;
    }
    if (!passwordsMatch) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const result = await signUpWithPassword(email, password);
      if ('error' in result) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Check your email for a confirmation link.' });
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
        <h2 className="text-xl font-bold tracking-[-0.02em] text-text-primary">Create account</h2>
        <p className="mt-1 text-[13px] text-text-tertiary">
          Sign up to save your watchlist and settings.
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
              placeholder="At least 8 characters"
              required
              autoComplete="new-password"
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
          {password && (
            <div className="flex gap-3 text-[10px] font-mono mt-1">
              <span className={password.length >= 8 ? 'text-emerald' : 'text-text-muted'}>8+ chars</span>
              <span className={/[a-zA-Z]/.test(password) ? 'text-emerald' : 'text-text-muted'}>letter</span>
              <span className={/\d/.test(password) ? 'text-emerald' : 'text-text-muted'}>number</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm-password" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat password"
            required
            autoComplete="new-password"
            className="w-full glass rounded-lg px-4 py-2.5 text-[14px] font-mono text-text-primary placeholder:text-text-muted bg-transparent outline-none focus:border-accent/40 transition-colors"
          />
          {confirmPassword && !passwordsMatch && (
            <p className="text-[10px] font-mono text-rose mt-1">Passwords do not match</p>
          )}
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
          disabled={isLoading || !passwordValid || !passwordsMatch}
          className="w-full py-2.5 rounded-lg bg-accent/15 text-accent-bright text-[13px] font-semibold border border-accent/30 hover:bg-accent/25 disabled:opacity-50 disabled:cursor-default transition-colors"
        >
          {isLoading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="mt-6 text-center text-[12px] text-text-muted">
        Already have an account?{' '}
        <a href="/login" className="font-medium text-accent-bright hover:text-accent transition-colors">
          Sign in
        </a>
      </p>
    </>
  );
}
