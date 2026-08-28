import { Controller, Get } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RolesService } from './roles.service';

@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('roles')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  findAllRoles() {
    return this.rolesService.findAllRoles();
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }
}
