import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/auth.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/**
 * Pushes realtime events to browsers. Delivery goes through Redis Pub/Sub
 * (not a direct emit) so it still works when the API runs as multiple
 * instances: the user's socket may be connected to another instance.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: true } })
export class NotificationsGateway
  implements OnGatewayConnection, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private subscriber!: Redis;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    // a subscribed Redis connection cannot run other commands -> duplicate
    this.subscriber = this.redis.duplicate();
    await this.subscriber.psubscribe('notifications:*', 'media:*');
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      const [kind, id] = channel.split(':');
      const event = JSON.parse(message);
      if (kind === 'notifications') {
        // deliver only to that user's sockets
        this.server.to(`user:${id}`).emit('notification', event);
      } else {
        // media status updates are feed-public -> broadcast
        this.server.emit('media-update', event);
      }
    });
  }

  async onModuleDestroy() {
    await this.subscriber?.quit();
  }

  /** Authenticate the socket via JWT and join its private room. */
  async handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) throw new Error('missing token');
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      await socket.join(`user:${payload.sub}`);
    } catch {
      this.logger.warn(`socket ${socket.id} rejected: bad token`);
      socket.disconnect(true);
    }
  }
}
