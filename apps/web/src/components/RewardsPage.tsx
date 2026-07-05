import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Reward } from '../lib/types';
import { useUiStore } from '../store/ui';

export function RewardsPage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  const rewards = useQuery({
    queryKey: ['rewards'],
    queryFn: async () => (await api.get<Reward[]>('/rewards')).data,
  });

  const redeem = useMutation({
    mutationFn: async (reward: Reward) => {
      // one fresh Idempotency-Key per redeem attempt: double-clicks reuse
      // the in-flight mutation (button disabled), retries after failure
      // get a new key — the backend dedupes on this key (4th defense layer)
      const idempotencyKey = crypto.randomUUID();
      return (
        await api.post(`/rewards/${reward.id}/redeem`, null, {
          headers: { 'Idempotency-Key': idempotencyKey },
        })
      ).data;
    },
    onMutate: (reward) => setRedeemingId(reward.id),
    onSuccess: (_data, reward) => {
      pushToast(`Redeemed "${reward.name}" 🎁`);
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    },
    onError: (e) => pushToast(errorMessage(e), 'error'),
    onSettled: () => setRedeemingId(null),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h2 className="text-lg font-bold text-slate-800">Rewards catalog</h2>
      {rewards.isLoading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : rewards.data?.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No rewards available.</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {rewards.data?.map((reward) => (
            <div
              key={reward.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="font-semibold text-slate-800">{reward.name}</p>
              <p className="mt-1 text-sm text-emerald-600">
                {reward.cost} points
              </p>
              <button
                onClick={() => redeem.mutate(reward)}
                disabled={redeem.isPending}
                className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {redeemingId === reward.id ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Redeeming…
                  </>
                ) : (
                  'Redeem'
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
