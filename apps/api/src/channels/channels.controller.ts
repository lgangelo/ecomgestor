import { Controller, Get } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ChannelsService } from './channels.service';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.channelsService.findAll(user.companyId);
  }
}
