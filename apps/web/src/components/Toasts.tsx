import { useUiStore } from '../store/ui';

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const remove = useUiStore((s) => s.removeToast);
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => remove(t.id)}
          className={`rounded-lg px-4 py-3 text-sm text-white shadow-lg text-left ${
            t.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
