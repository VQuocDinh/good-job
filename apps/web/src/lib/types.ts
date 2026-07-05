export interface User {
  id: string;
  email: string;
  name: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface Budget {
  yearMonth: string;
  allocated: number;
  spent: number;
  remaining: number;
}

export interface KudoMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  status: 'processing' | 'ready' | 'failed';
}

export interface Reaction {
  id: string;
  kudoId: string;
  userId: string;
  emoji: string;
}

export interface Comment {
  id: string;
  kudoId: string;
  userId: string;
  text: string | null;
  mediaUrl: string | null;
  createdAt: string;
}

export interface Kudo {
  id: string;
  senderId: string;
  receiverId: string;
  points: number;
  description: string;
  coreValue: string;
  createdAt: string;
  sender: Pick<User, 'id' | 'name'>;
  receiver: Pick<User, 'id' | 'name'>;
  media: KudoMedia[];
  reactions: Reaction[];
  comments: Comment[];
}

export interface FeedPage {
  items: Kudo[];
  nextCursor: string | null;
}

export interface Reward {
  id: string;
  name: string;
  cost: number;
  active: boolean;
}

export interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: Notification[];
  unreadCount: number;
}
