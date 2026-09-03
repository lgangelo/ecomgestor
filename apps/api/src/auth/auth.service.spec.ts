import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../audit/audit.service';

const USER = {
  id: 'user-1',
  companyId: 'company-1',
  email: 'test@example.com',
  name: 'Teste',
  isActive: true,
  userRoles: [],
};

function makeService(storedToken: {
  id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  user: typeof USER;
} | null) {
  const refreshTokenUpdateMany = jest.fn();
  const refreshTokenUpdate = jest.fn();
  const refreshTokenCreate = jest.fn();
  const auditLog = jest.fn();

  const prisma = {
    client: {
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue(storedToken),
        updateMany: refreshTokenUpdateMany,
        update: refreshTokenUpdate,
        create: refreshTokenCreate,
      },
    },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('fake-access-token') };
  const config = { get: jest.fn().mockReturnValue('fake-secret') };
  const audit = { log: auditLog };

  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
    audit as unknown as AuditService,
  );

  return { service, refreshTokenUpdateMany, refreshTokenUpdate, refreshTokenCreate, auditLog };
}

describe('AuthService.refresh — deteccao de reuso de refresh token', () => {
  it('rejeita e revoga TODAS as sessoes do usuario quando um token JA REVOGADO e reapresentado', async () => {
    const { service, refreshTokenUpdateMany, auditLog } = makeService({
      id: 'token-1',
      userId: USER.id,
      revokedAt: new Date('2026-01-01'), // já foi usado/rotacionado antes
      expiresAt: new Date('2099-01-01'),
      user: USER,
    });

    await expect(service.refresh('raw-token', {})).rejects.toThrow(UnauthorizedException);

    // Revoga por usuario (todas as sessoes), nao so o token especifico reapresentado.
    expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: USER.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'SESSION_REUSE_DETECTED', userId: USER.id }));
  });

  it('rejeita sem revogar em massa quando o token simplesmente nao existe (nunca foi emitido)', async () => {
    const { service, refreshTokenUpdateMany, auditLog } = makeService(null);

    await expect(service.refresh('raw-token', {})).rejects.toThrow(UnauthorizedException);

    expect(refreshTokenUpdateMany).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('rejeita quando o token existe, nunca foi revogado, mas ja expirou', async () => {
    const { service, refreshTokenUpdateMany } = makeService({
      id: 'token-1',
      userId: USER.id,
      revokedAt: null,
      expiresAt: new Date('2020-01-01'),
      user: USER,
    });

    await expect(service.refresh('raw-token', {})).rejects.toThrow(UnauthorizedException);
    expect(refreshTokenUpdateMany).not.toHaveBeenCalled();
  });

  it('renova normalmente quando o token e valido e nunca foi usado antes', async () => {
    const { service, refreshTokenUpdate, refreshTokenCreate } = makeService({
      id: 'token-1',
      userId: USER.id,
      revokedAt: null,
      expiresAt: new Date('2099-01-01'),
      user: USER,
    });

    const session = await service.refresh('raw-token', {});

    expect(session.accessToken).toBe('fake-access-token');
    // Rotacao: revoga so o token USADO (por id), nao todas as sessoes do usuario.
    expect(refreshTokenUpdate).toHaveBeenCalledWith({ where: { id: 'token-1' }, data: { revokedAt: expect.any(Date) } });
    expect(refreshTokenCreate).toHaveBeenCalled();
  });
});
