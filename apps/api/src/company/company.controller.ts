import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller('company')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  findOne(@CurrentUser() user: AuthenticatedUser) {
    return this.companyService.findOrThrow(user.companyId);
  }

  @Patch()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  async update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCompanyDto) {
    const { old: oldValue, updated } = await this.companyService.update(user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'company',
      entityId: updated.id,
      oldValue,
      newValue: updated,
    });
    return updated;
  }
}
