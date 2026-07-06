import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from './api';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';

/**
 * One realtime connection per session. Server pushes:
 * - `notification` (private): toast + refresh the bell
 * - `media-update` (broadcast): a video finished processing -> refresh feed
 */
export function useRealtime() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, { auth: { token } });

    socket.on('notification', (event: { payload?: { message?: string } }) => {
      if (event.payload?.message) pushToast(`🔔 ${event.payload.message}`);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      // points may have changed (kudo received)
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    });

    socket.on('media-update', () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [token, queryClient, pushToast]);
}
