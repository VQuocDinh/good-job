import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import type { FeedPage as FeedPageData } from '../lib/types';
import { KudoCard } from './KudoCard';

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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      {feed.isLoading ? (
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
