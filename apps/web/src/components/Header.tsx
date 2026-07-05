import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import type { Budget, Notification, NotificationList } from '../lib/types';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';

export function Header({
  tab,
  onTabChange,
}: {
  tab: 'feed' | 'rewards';
  onTabChange: (tab: 'feed' | 'rewards') => void;
}) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setGiveModalOpen = useUiStore((s) => s.setGiveModalOpen);
  const [bellOpen, setBellOpen] = useState(false);
  const queryClient = useQueryClient();

  const budget = useQuery({
    queryKey: ['budget'],
    queryFn: async () => (await api.get<Budget>('/users/me/budget')).data,
  });
  const balance = useQuery({
    queryKey: ['balance'],
    queryFn: async () =>
      (await api.get<{ balance: number }>('/users/me/balance')).data,
  });
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      (await api.get<NotificationList>('/notifications')).data,
    // polling fallback; GĐ6 will push over websocket
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) =>
      (await api.patch<Notification>(`/notifications/${id}/read`)).data,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
        <h1 className="text-lg font-bold text-slate-800">
          Good Job <span aria-hidden>👏</span>
        </h1>

        <nav className="flex gap-1">
          {(['feed', 'rewards'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              className={`rounded-full px-3 py-1 text-sm capitalize ${
                tab === t
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right text-xs sm:block">
            <div className="text-slate-500">
              Budget{' '}
              <span className="font-semibold text-indigo-600">
                {budget.data ? budget.data.remaining : '…'}
              </span>
            </div>
            <div className="text-slate-500">
              Balance{' '}
              <span className="font-semibold text-emerald-600">
                {balance.data ? balance.data.balance : '…'}
              </span>
            </div>
          </div>

          <button
            onClick={() => setGiveModalOpen(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Give kudos
          </button>

          <div className="relative">
            <button
              aria-label="Notifications"
              onClick={() => setBellOpen((o) => !o)}
              className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
            >
              <span aria-hidden>🔔</span>
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {notifications.data?.items.length ? (
                  notifications.data.items.slice(0, 10).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => !n.readAt && markRead.mutate(n.id)}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                        n.readAt ? 'text-slate-400' : 'font-medium text-slate-700'
                      }`}
                    >
                      {String(
                        (n.payload as { message?: string }).message ?? n.type,
                      )}
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-center text-xs text-slate-400">
                    No notifications yet
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-medium text-slate-700 sm:block">
              {user?.name}
            </span>
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
