import { Controller, Get, INestApplication, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME, PERMISSIONS } from '@ecommerce-manager/shared';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { CsrfGuard } from '../src/common/guards/csrf.guard';
import { Public } from '../src/common/decorators/public.decorator';
import { RequirePermissions } from '../src/common/decorators/permissions.decorator';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../src/auth/types/authenticated-user';

const ACCESS_SECRET = 'test-only-access-secret-please-change-1234567890';

@Controller('test')
class TestController {
  @Public()
  @Get('public')
  publicRoute() {
    return { ok: true };
  }

  @Get('protected')
  protectedRoute(@CurrentUser() user: AuthenticatedUser) {
    return { userId: user.userId };
  }

  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @Get('needs-permission')
  needsPermission() {
    return { ok: true };
  }

  @Post('mutate')
  mutate() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ jwtAccessSecret: ACCESS_SECRET })],
    }),
    JwtModule.register({}),
  ],
  controllers: [TestController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
class TestAppModule {}

describe('Auth guards (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function signAccessToken(overrides: Partial<AuthenticatedUser> = {}): Promise<string> {
    const payload = {
      sub: 'user-1',
      email: 'user@example.com',
      name: 'Usuário Teste',
      companyId: 'company-1',
      roles: ['VIEWER'],
      permissions: [] as string[],
      ...overrides,
    };
    return jwtService.signAsync(payload, { secret: ACCESS_SECRET, expiresIn: 60 });
  }

  it('allows public routes without any cookie', async () => {
    await request(app.getHttpServer()).get('/test/public').expect(200, { ok: true });
  });

  it('rejects protected routes without an access token cookie', async () => {
    await request(app.getHttpServer()).get('/test/protected').expect(401);
  });

  it('allows protected routes with a valid access token cookie', async () => {
    const token = await signAccessToken();
    const response = await request(app.getHttpServer())
      .get('/test/protected')
      .set('Cookie', [`${AUTH_COOKIE_NAME}=${token}`])
      .expect(200);
    expect(response.body).toEqual({ userId: 'user-1' });
  });

  it('rejects routes requiring a permission the user does not have', async () => {
    const token = await signAccessToken({ permissions: [] });
    await request(app.getHttpServer())
      .get('/test/needs-permission')
      .set('Cookie', [`${AUTH_COOKIE_NAME}=${token}`])
      .expect(403);
  });

  it('allows routes requiring a permission the user does have', async () => {
    const token = await signAccessToken({ permissions: [PERMISSIONS.SETTINGS_MANAGE] });
    await request(app.getHttpServer())
      .get('/test/needs-permission')
      .set('Cookie', [`${AUTH_COOKIE_NAME}=${token}`])
      .expect(200);
  });

  it('rejects mutating requests without a matching CSRF header', async () => {
    const token = await signAccessToken();
    await request(app.getHttpServer())
      .post('/test/mutate')
      .set('Cookie', [`${AUTH_COOKIE_NAME}=${token}`, `${CSRF_COOKIE_NAME}=csrf-value`])
      .expect(403);
  });

  it('allows mutating requests when the CSRF header matches the cookie', async () => {
    const token = await signAccessToken();
    await request(app.getHttpServer())
      .post('/test/mutate')
      .set('Cookie', [`${AUTH_COOKIE_NAME}=${token}`, `${CSRF_COOKIE_NAME}=csrf-value`])
      .set(CSRF_HEADER_NAME, 'csrf-value')
      .expect(201);
  });
});
