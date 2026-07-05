import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/auth.service';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get('me/budget')
  getBudget(@CurrentUser() user: JwtPayload) {
    return this.users.getBudget(user.sub);
  }

  @Get('me/balance')
  getBalance(@CurrentUser() user: JwtPayload) {
    return this.users.getBalance(user.sub);
  }
}
