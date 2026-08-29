import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

/** Central de notificações (seção 44 da Fase 4) — sem `@RequirePermissions`: é a caixa de
 * entrada pessoal de qualquer usuário autenticado da empresa, igual à busca global. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.list(user.companyId, Boolean(query.unreadOnly));
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.notificationsService.getUnreadCount(user.companyId);
    return { count };
  }

  @Patch(':id/read')
  markAsRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user.companyId, id);
  }

  @Post('read-all')
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.notificationsService.markAllAsRead(user.companyId);
    return { count };
  }
}
