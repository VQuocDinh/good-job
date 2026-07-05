import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { LoginResponse } from '../lib/types';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';

const DEMO_USERS = [
  'alice@goodjob.dev',
  'bob@goodjob.dev',
  'carol@goodjob.dev',
];

export function LoginPage() {
  const [email, setEmail] = useState(DEMO_USERS[0]);
  const setSession = useAuthStore((s) => s.setSession);
  const pushToast = useUiStore((s) => s.pushToast);

  const login = useMutation({
    mutationFn: async (value: string) => {
      const res = await api.post<LoginResponse>('/auth/login', {
        email: value,
      });
      return res.data;
    },
    onSuccess: (data) => setSession(data.accessToken, data.user),
    onError: (e) => pushToast(errorMessage(e), 'error'),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate(email);
        }}
      >
        <h1 className="text-2xl font-bold text-slate-800">
          Good Job <span aria-hidden>👏</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Recognize teammates, earn points, redeem rewards.
        </p>

        <label className="mt-6 block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            placeholder="you@goodjob.dev"
            required
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_USERS.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setEmail(u)}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200"
            >
              {u.split('@')[0]}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={login.isPending}
          className="mt-6 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
