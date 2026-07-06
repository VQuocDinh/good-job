import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, assetUrl, errorMessage } from '../lib/api';
import type { Kudo } from '../lib/types';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';

const EMOJIS = ['👏', '🔥', '❤️'];

export function KudoCard({ kudo }: { kudo: Kudo }) {
  const me = useAuthStore((s) => s.user);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');

  const invalidateFeed = () =>
    queryClient.invalidateQueries({ queryKey: ['feed'] });

  const react = useMutation({
    mutationFn: async (emoji: string) =>
      api.post(`/kudos/${kudo.id}/reactions`, { emoji }),
    onSuccess: invalidateFeed,
    onError: (e) => pushToast(errorMessage(e), 'error'),
  });

  const addComment = useMutation({
    mutationFn: async (text: string) =>
      api.post(`/kudos/${kudo.id}/comments`, { text }),
    onSuccess: () => {
      setComment('');
      invalidateFeed();
    },
    onError: (e) => pushToast(errorMessage(e), 'error'),
  });

  const reactionCounts = kudo.reactions.reduce<Record<string, number>>(
    (acc, r) => ({ ...acc, [r.emoji]: (acc[r.emoji] ?? 0) + 1 }),
    {},
  );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">
            {kudo.sender.name}
          </span>{' '}
          →{' '}
          <span className="font-semibold text-slate-800">
            {kudo.receiver.name}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-bold text-emerald-700">
            +{kudo.points}
          </span>
        </div>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
        {kudo.description}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
          {kudo.coreValue}
        </span>
        <span className="text-xs text-slate-400">
          {new Date(kudo.createdAt).toLocaleString()}
        </span>
      </div>

      {kudo.media.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {kudo.media.map((m) =>
            m.status === 'processing' ? (
              <span
                key={m.id}
                className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
              >
                ⏳ Video is processing…
              </span>
            ) : m.status === 'failed' ? (
              <span
                key={m.id}
                className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
              >
                Video rejected (over 3 minutes?)
              </span>
            ) : m.type === 'video' ? (
              <video
                key={m.id}
                src={assetUrl(m.url)}
                controls
                className="max-h-64 rounded-lg"
              />
            ) : (
              <img
                key={m.id}
                src={assetUrl(m.url)}
                alt=""
                className="max-h-64 rounded-lg object-cover"
              />
            ),
          )}
        </div>
      )}

      <div className="mt-3 flex gap-1">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => react.mutate(emoji)}
            disabled={react.isPending}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
          >
            {emoji}
            {reactionCounts[emoji] ? (
              <span className="ml-1 font-semibold text-slate-600">
                {reactionCounts[emoji]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {kudo.comments.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {kudo.comments.map((c) => (
            <li key={c.id} className="text-xs text-slate-600">
              {c.text}
              {c.mediaUrl && (
                <img
                  src={c.mediaUrl}
                  alt=""
                  className="mt-1 max-h-32 rounded-lg"
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (comment.trim()) addComment.mutate(comment.trim());
        }}
      >
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={`Comment as ${me?.name ?? 'you'}…`}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={addComment.isPending || !comment.trim()}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {addComment.isPending ? '…' : 'Send'}
        </button>
      </form>
    </article>
  );
}
