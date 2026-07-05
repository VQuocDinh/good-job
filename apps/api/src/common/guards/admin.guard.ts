import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from '../../modules/auth/auth.service';

/**
 * Admin check via ADMIN_EMAILS env (comma-separated). The schema has no
 * role column by design for this scope — documented trade-off; a real
 * system would move roles into the User table or an RBAC service.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const admins = this.config
      .get<string>('ADMIN_EMAILS', 'alice@goodjob.dev')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (!req.user || !admins.includes(req.user.email.toLowerCase())) {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
