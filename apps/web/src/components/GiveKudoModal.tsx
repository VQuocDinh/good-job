import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { FeedPage, Kudo, User } from '../lib/types';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';

const CORE_VALUES = ['#Teamwork', '#Ownership', '#Innovation', '#Customer'];

interface GiveKudoInput {
  receiverId: string;
  points: number;
  description: string;
  coreValue: string;
}

export function GiveKudoModal() {
  const open = useUiStore((s) => s.giveModalOpen);
  const setOpen = useUiStore((s) => s.setGiveModalOpen);
  const pushToast = useUiStore((s) => s.pushToast);
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [receiverId, setReceiverId] = useState('');
  const [points, setPoints] = useState(20);
  const [description, setDescription] = useState('');
  const [coreValue, setCoreValue] = useState(CORE_VALUES[0]);
  const [file, setFile] = useState<File | null>(null);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
    enabled: open,
  });

  const give = useMutation({
    mutationFn: async (input: GiveKudoInput) => {
      const kudo = (await api.post<Kudo>('/kudos', input)).data;
      if (file) {
        // video: API answers immediately with status=processing, a BullMQ
        // worker validates it async and the feed updates over websocket
        const form = new FormData();
        form.append('file', file);
        await api.post(`/kudos/${kudo.id}/media`, form);
      }
      return kudo;
    },
    // optimistic update: prepend a temporary kudo to the first feed page
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const previous = queryClient.getQueryData(['feed']);
      const receiver = users.data?.find((u) => u.id === input.receiverId);
      queryClient.setQueryData(
        ['feed'],
        (old: { pages: FeedPage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          const optimistic: Kudo = {
            id: `optimistic-${Date.now()}`,
            senderId: me?.id ?? '',
            receiverId: input.receiverId,
            points: input.points,
            description: input.description,
            coreValue: input.coreValue,
            createdAt: new Date().toISOString(),
            sender: { id: me?.id ?? '', name: me?.name ?? 'You' },
            receiver: {
              id: input.receiverId,
              name: receiver?.name ?? '…',
            },
            media: [],
            reactions: [],
            comments: [],
          };
          return {
            ...old,
            pages: [
              { ...old.pages[0], items: [optimistic, ...old.pages[0].items] },
              ...old.pages.slice(1),
            ],
          };
        },
      );
      return { previous };
    },
    onError: (e, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['feed'], ctx.previous);
      pushToast(errorMessage(e), 'error');
    },
    onSuccess: () => {
      pushToast(
        file?.type.startsWith('video/')
          ? 'Kudos sent! Video is processing… 🎬'
          : 'Kudos sent! 👏',
      );
      setOpen(false);
      setDescription('');
      setPoints(20);
      setFile(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });

  if (!open) return null;

  const receivers = (users.data ?? []).filter((u) => u.id !== me?.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setOpen(false)}
    >
      <form
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!receiverId || !description.trim()) return;
          give.mutate({
            receiverId,
            points,
            description: description.trim(),
            coreValue,
          });
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Give kudos 👏</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          To
          <select
            value={receiverId}
            onChange={(e) => setReceiverId(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="" disabled>
              {users.isLoading ? 'Loading teammates…' : 'Select a teammate'}
            </option>
            {receivers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Points: <span className="font-bold text-indigo-600">{points}</span>
          <input
            type="range"
            min={10}
            max={50}
            step={5}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            className="mt-1 w-full accent-indigo-600"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Why? <span className="text-red-500">*</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={3}
            placeholder="What did they do that was awesome?"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Photo / video (optional, video ≤ 3 min)
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </label>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-700">Core value</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {CORE_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setCoreValue(v)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  coreValue === v
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={give.isPending || !receiverId || !description.trim()}
          className="mt-6 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {give.isPending ? 'Sending…' : `Send ${points} points`}
        </button>
      </form>
    </div>
  );
}
