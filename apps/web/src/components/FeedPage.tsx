import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { FeedPage as FeedPageData, Kudo } from '../lib/types';
import { KudoCard } from './KudoCard';

function MonthlySummaryCard() {
  const summary = useQuery({
    queryKey: ['monthly-summary'],
    queryFn: async () =>
      (
        await api.get<{ summary: string; ai: boolean }>(
          '/users/me/monthly-summary',
        )
      ).data,
    staleTime: 5 * 60_000,
  });
  if (!summary.data) return null;
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
        {summary.data.ai ? '✨ AI summary — your month' : 'Your month'}
      </p>
      <p className="mt-1 text-sm text-indigo-900">{summary.data.summary}</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5">
      <div className="h-3 w-1/3 rounded bg-slate-200" />
      <div className="mt-3 h-3 w-full rounded bg-slate-100" />
      <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
    </div>
  );
}

export function FeedPage() {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');

  const search = useQuery({
    queryKey: ['search', query],
    queryFn: async () =>
      (
        await api.get<{ items: Kudo[]; semantic: boolean }>('/kudos/search', {
          params: { q: query },
        })
      ).data,
    enabled: query.length > 0,
  });

  const feed = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: async ({ pageParam }) => {
      const res = await api.get<FeedPageData>('/kudos', {
        params: { limit: 10, cursor: pageParam || undefined },
      });
      return res.data;
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (
        entries[0].isIntersecting &&
        feed.hasNextPage &&
        !feed.isFetchingNextPage
      ) {
        feed.fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [feed]);

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const searching = query.length > 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <MonthlySummaryCard />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(searchInput.trim());
        }}
      >
        <input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            if (!e.target.value.trim()) setQuery('');
          }}
          placeholder="Search kudos by meaning… (e.g. 'helped out in a crisis')"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Search
        </button>
      </form>

      {searching ? (
        search.isLoading ? (
          <SkeletonCard />
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {search.data?.items.length ?? 0} results for “{query}”
              {search.data?.semantic ? ' · semantic search ✨' : ' · keyword match'}
            </p>
            {search.data?.items.map((kudo) => (
              <KudoCard key={kudo.id} kudo={kudo} />
            ))}
          </>
        )
      ) : feed.isLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-3xl" aria-hidden>
            👏
          </p>
          <p className="mt-2 font-medium text-slate-700">No kudos yet</p>
          <p className="text-sm text-slate-500">
            Be the first one to recognize a teammate!
          </p>
        </div>
      ) : (
        items.map((kudo) => <KudoCard key={kudo.id} kudo={kudo} />)
      )}

      <div ref={sentinelRef} />
      {feed.isFetchingNextPage && <SkeletonCard />}
      {!feed.hasNextPage && items.length > 0 && (
        <p className="py-2 text-center text-xs text-slate-400">
          You're all caught up 🎉
        </p>
      )}
    </div>
  );
}
