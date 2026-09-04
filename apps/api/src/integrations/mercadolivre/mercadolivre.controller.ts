import { Controller, Get } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { MercadoLivreHealthService } from './mercadolivre-health.service';

@Controller('integrations/mercadolivre')
export class MercadoLivreController {
  constructor(private readonly health: MercadoLivreHealthService) {}

  @Get('status')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MERCADOLIVRE_READ)
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.health.getStatus(user.companyId);
  }
}
