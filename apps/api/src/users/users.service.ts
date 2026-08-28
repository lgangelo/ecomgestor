import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@ecommerce-manager/database';
import { generateRandomPassword, hashPassword } from '@ecommerce-manager/shared-server';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    const users = await this.prisma.client.user.findMany({
      where: { companyId },
      include: { userRoles: { include: { role: true } } },
      orderBy: { name: 'asc' },
    });

    return users.map((user) => this.toListItem(user));
  }

  private toListItem(user: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    lastLoginAt: Date | null;
    userRoles: Array<{ role: { id: string; name: string } }>;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      roles: user.userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
    };
  }

  private async assertRolesExist(roleIds: string[]) {
    const roles = await this.prisma.client.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw new NotFoundException('Um ou mais perfis (roles) informados não existem');
    }
  }

  async create(companyId: string, dto: CreateUserDto) {
    await this.assertRolesExist(dto.roleIds);

    const generatedPassword = dto.password ? undefined : generateRandomPassword();
    const passwordHash = await hashPassword(dto.password ?? generatedPassword!);

    try {
      const user = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            companyId,
            name: dto.name,
            email: dto.email,
            passwordHash,
            isActive: true,
          },
        });
        await tx.userRole.createMany({
          data: dto.roleIds.map((roleId) => ({ userId: created.id, roleId })),
        });
        return tx.user.findUniqueOrThrow({
          where: { id: created.id },
          include: { userRoles: { include: { role: true } } },
        });
      });

      return {
        ...this.toListItem(user),
        ...(generatedPassword ? { generatedPassword } : {}),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe um usuário com esse e-mail');
      }
      throw error;
    }
  }

  async update(id: string, companyId: string, dto: UpdateUserDto) {
    const existing = await this.prisma.client.user.findFirst({ where: { id, companyId } });
    if (!existing) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (dto.roleIds) {
      await this.assertRolesExist(dto.roleIds);
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id },
        include: { userRoles: { include: { role: true } } },
      });
    });

    return { old: this.toListItem({ ...existing, userRoles: [] }), updated: this.toListItem(updated) };
  }
}
