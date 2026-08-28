import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllRoles() {
    const roles = await this.prisma.client.role.findMany({
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.rolePermissions.map((rp) => rp.permission.key),
    }));
  }

  findAllPermissions() {
    return this.prisma.client.permission.findMany({
      select: { key: true, description: true },
      orderBy: { key: 'asc' },
    });
  }
}
