import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Mock login: identify by email only (no password — documented trade-off,
   * real deployment would plug in SSO/OIDC here).
   */
  async login(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Unknown user');
    }
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}
