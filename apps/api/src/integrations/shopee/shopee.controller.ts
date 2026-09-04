import { Controller, Get } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { ShopeeHealthService } from './shopee-health.service';

@Controller('integrations/shopee')
export class ShopeeController {
  constructor(private readonly health: ShopeeHealthService) {}

  @Get('status')
  @RequirePermissions(PERMISSIONS.INTEGRATION_SHOPEE_READ)
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.health.getStatus(user.companyId);
  }
}
