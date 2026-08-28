import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll(user.companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    const created = await this.usersService.create(user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'user',
      entityId: created.id,
      newValue: { name: created.name, email: created.email, roles: created.roles },
    });
    return created;
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const { old: oldValue, updated } = await this.usersService.update(id, user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'user',
      entityId: updated.id,
      oldValue,
      newValue: updated,
    });
    return updated;
  }
}
