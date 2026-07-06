import { useState } from 'react';
import { FeedPage } from './components/FeedPage';
import { GiveKudoModal } from './components/GiveKudoModal';
import { Header } from './components/Header';
import { LoginPage } from './components/LoginPage';
import { RewardsPage } from './components/RewardsPage';
import { Toasts } from './components/Toasts';
import { useRealtime } from './lib/socket';
import { useAuthStore } from './store/auth';

export default function App() {
  const token = useAuthStore((s) => s.token);
  const [tab, setTab] = useState<'feed' | 'rewards'>('feed');
  useRealtime();

  if (!token) {
    return (
      <>
        <LoginPage />
        <Toasts />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Header tab={tab} onTabChange={setTab} />
      {tab === 'feed' ? <FeedPage /> : <RewardsPage />}
      <GiveKudoModal />
      <Toasts />
    </div>
  );
}
