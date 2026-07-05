import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface UiState {
  giveModalOpen: boolean;
  setGiveModalOpen: (open: boolean) => void;
  toasts: Toast[];
  pushToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: number) => void;
}

let nextToastId = 1;

export const useUiStore = create<UiState>((set) => ({
  giveModalOpen: false,
  setGiveModalOpen: (open) => set({ giveModalOpen: open }),
  toasts: [],
  pushToast: (message, type = 'success') => {
    const id = nextToastId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
