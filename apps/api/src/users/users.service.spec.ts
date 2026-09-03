import { UsersService } from './users.service';
import type { PrismaService } from '../common/prisma/prisma.service';

const COMPANY_ID = 'company-1';
const USER_ID = 'user-1';

function makeService() {
  const existing = { id: USER_ID, companyId: COMPANY_ID, name: 'Teste', email: 't@x.com', isActive: true, lastLoginAt: null };
  const refreshTokenUpdateMany = jest.fn();

  const tx = {
    user: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...existing, userRoles: [] }),
    },
    userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
    refreshToken: { updateMany: refreshTokenUpdateMany },
  };

  const prisma = {
    client: {
      user: { findFirst: jest.fn().mockResolvedValue(existing) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    },
  };

  const service = new UsersService(prisma as unknown as PrismaService);
  return { service, refreshTokenUpdateMany };
}

describe('UsersService.update — desativar usuario corta o acesso na hora', () => {
  it('revoga todo refresh token ativo quando isActive vira false', async () => {
    const { service, refreshTokenUpdateMany } = makeService();

    await service.update(USER_ID, COMPANY_ID, { isActive: false });

    expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('nao mexe em refresh token quando so o nome muda (usuario continua ativo)', async () => {
    const { service, refreshTokenUpdateMany } = makeService();

    await service.update(USER_ID, COMPANY_ID, { name: 'Novo Nome' });

    expect(refreshTokenUpdateMany).not.toHaveBeenCalled();
  });
});
