import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/auth.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateReactionDto } from './dto/create-reaction.dto';
import { FeedQueryDto } from './dto/feed-query.dto';
import { GiveKudoDto } from './dto/give-kudo.dto';
import { UpdateKudoDto } from './dto/update-kudo.dto';
import { KudosService } from './kudos.service';

@Controller('kudos')
@UseGuards(JwtAuthGuard)
export class KudosController {
  constructor(private readonly kudos: KudosService) {}

  @Post()
  give(@CurrentUser() user: JwtPayload, @Body() dto: GiveKudoDto) {
    return this.kudos.giveKudo(user.sub, dto);
  }

  @Get()
  feed(@Query() query: FeedQueryDto) {
    return this.kudos.getFeed(query.cursor, query.limit ?? 20);
  }

  @Get('search')
  search(@Query('q') q?: string) {
    if (!q?.trim()) return { items: [], semantic: false };
    return this.kudos.search(q.trim(), 10);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateKudoDto,
  ) {
    return this.kudos.updateKudo(user.sub, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.kudos.deleteKudo(user.sub, id);
  }

  @Post(':id/reactions')
  react(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateReactionDto,
  ) {
    return this.kudos.addReaction(user.sub, id, dto.emoji);
  }

  @Post(':id/comments')
  comment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.kudos.addComment(user.sub, id, dto);
  }
}
