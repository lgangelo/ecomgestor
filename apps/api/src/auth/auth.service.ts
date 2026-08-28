import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { verifyPassword } from '@ecommerce-manager/shared-server';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@ecommerce-manager/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccessTokenPayload, AuthenticatedUser } from './types/authenticated-user';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  user: AuthenticatedUser;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta): Promise<IssuedSession> {
    const user = await this.prisma.client.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
        },
      },
    });

    // Mensagem genérica em ambos os casos para não vazar quais e-mails existem.
    const invalidCredentials = () =>
      new UnauthorizedException('E-mail ou senha inválidos.');

    if (!user || !user.isActive) throw invalidCredentials();

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException(
        'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.',
      );
    }

    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
      throw invalidCredentials();
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const permissions = this.extractPermissions(user.userRoles);
    const roles = user.userRoles.map((ur) => ur.role.name);
    const authUser: AuthenticatedUser = {
      userId: user.id,
      email: user.email,
      name: user.name,
      companyId: user.companyId,
      roles,
      permissions,
    };

    const session = await this.issueSession(authUser, meta);

    await this.auditService.log({
      companyId: user.companyId,
      userId: user.id,
      action: 'LOGIN',
      entity: 'user',
      entityId: user.id,
      ip: meta.ip,
    });

    return session;
  }

  async refresh(rawRefreshToken: string, meta: RequestMeta): Promise<IssuedSession> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: { include: { rolePermissions: { include: { permission: true } } } },
              },
            },
          },
        },
      },
    });

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }
    if (!stored.user.isActive) {
      throw new UnauthorizedException('Usuário inativo.');
    }

    // Rotação: revoga o token usado e emite um novo par.
    await this.prisma.client.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const permissions = this.extractPermissions(stored.user.userRoles);
    const roles = stored.user.userRoles.map((ur) => ur.role.name);
    const authUser: AuthenticatedUser = {
      userId: stored.user.id,
      email: stored.user.email,
      name: stored.user.name,
      companyId: stored.user.companyId,
      roles,
      permissions,
    };

    return this.issueSession(authUser, meta);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.client.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: AuthenticatedUser, meta: RequestMeta): Promise<IssuedSession> {
    const payload: AccessTokenPayload = {
      sub: user.userId,
      email: user.email,
      name: user.name,
      companyId: user.companyId,
      roles: user.roles,
      permissions: user.permissions,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwtAccessSecret'),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    const rawRefreshToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.client.refreshToken.create({
      data: {
        userId: user.userId,
        tokenHash,
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });

    const csrfToken = randomBytes(32).toString('hex');

    return { accessToken, refreshToken: rawRefreshToken, csrfToken, user };
  }

  private async registerFailedAttempt(userId: string, currentAttempts: number): Promise<void> {
    const attempts = currentAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : undefined,
      },
    });
  }

  private extractPermissions(
    userRoles: Array<{ role: { rolePermissions: Array<{ permission: { key: string } }> } }>,
  ): string[] {
    const set = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) {
        set.add(rp.permission.key);
      }
    }
    return Array.from(set);
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
