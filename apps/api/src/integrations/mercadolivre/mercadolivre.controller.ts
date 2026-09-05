import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { MercadoLivreHealthService } from './mercadolivre-health.service';
import { MercadoLivreJobsService } from './mercadolivre-jobs.service';
import { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';
import { MercadoLivreInventorySyncService } from './mercadolivre-inventory-sync.service';
import { MercadoLivreStockOutboxService } from './mercadolivre-stock-outbox.service';
import { PushMercadoLivreInventoryDto } from './dto/push-mercadolivre-inventory.dto';
import { SetMercadoLivreAutoSyncDto } from './dto/set-mercadolivre-auto-sync.dto';

@Controller('integrations/mercadolivre')
export class MercadoLivreController {
  constructor(
    private readonly health: MercadoLivreHealthService,
    private readonly jobsService: MercadoLivreJobsService,
    private readonly credentialsService: MercadoLivreCredentialsService,
    private readonly inventorySync: MercadoLivreInventorySyncService,
    private readonly stockOutbox: MercadoLivreStockOutboxService,
  ) {}

  @Get('status')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MERCADOLIVRE_READ)
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.health.getStatus(user.companyId);
  }

  @Get('jobs')
  @RequirePermissions(PERMISSIONS.INTEGRATION_JOBS_READ)
  listFailedJobs(@CurrentUser() user: AuthenticatedUser) {
    return this.jobsService.listFailures(user.companyId);
  }

  @Post('jobs/:id/retry')
  @RequirePermissions(PERMISSIONS.INTEGRATION_JOBS_RETRY)
  async retryJob(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.jobsService.retryAndRequeue(id, user);
    return { requeued: true };
  }

  @Get('inventory/compare')
  @RequirePermissions(PERMISSIONS.INTEGRATION_INVENTORY_COMPARE)
  compareInventory(@CurrentUser() user: AuthenticatedUser) {
    return this.stockOutbox.getStatusReport(user.companyId);
  }

  @Get('inventory/push-enabled')
  @RequirePermissions(PERMISSIONS.INTEGRATION_INVENTORY_COMPARE)
  isPushEnabled() {
    return { enabled: this.inventorySync.isPushEnabled() };
  }

  @Post('inventory/push')
  @RequirePermissions(PERMISSIONS.INTEGRATION_INVENTORY_PUSH)
  pushInventory(@CurrentUser() user: AuthenticatedUser, @Body() dto: PushMercadoLivreInventoryDto) {
    return this.inventorySync.push(user.companyId, user.userId, dto.variantId);
  }

  /** Toggle por integração (Bloco 2) — mesma trava dupla da TikTok (também precisa de
   * `MERCADOLIVRE_INVENTORY_PUSH_ENABLED` ligado no servidor). */
  @Post('inventory/auto-sync')
  @RequirePermissions(PERMISSIONS.INTEGRATION_INVENTORY_PUSH)
  async setAutoSync(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetMercadoLivreAutoSyncDto) {
    await this.credentialsService.setAutoInventorySyncEnabled(user.companyId, dto.enabled);
    return { enabled: dto.enabled };
  }
}
