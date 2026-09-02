import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME } from '@ecommerce-manager/shared';
import { AuthService, IssuedSession } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './types/authenticated-user';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(dto.email, dto.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setSessionCookies(res, session);
    return { user: this.publicUser(session.user) };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!raw) throw new UnauthorizedException('Sessão não encontrada.');
    const session = await this.authService.refresh(raw, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setSessionCookies(res, session);
    return { user: this.publicUser(session.user) };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    await this.authService.logout(raw);
    this.clearSessionCookies(res);
    return { success: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user: this.publicUser(user) };
  }

  private publicUser(user: AuthenticatedUser) {
    return {
      id: user.userId,
      email: user.email,
      name: user.name,
      companyId: user.companyId,
      roles: user.roles,
      permissions: user.permissions,
    };
  }

  private setSessionCookies(res: Response, session: IssuedSession) {
    const secure = this.configService.get<boolean>('cookieSecure');
    const domain = this.configService.get<string>('cookieDomain');

    // Sem `maxAge`: os três cookies viram cookies DE SESSÃO DO NAVEGADOR — o navegador os
    // descarta sozinho ao ser encerrado de fato (não apenas fechar a aba), sem precisar de
    // nenhuma lógica nossa para isso. A validade de verdade continua sendo aplicada do lado do
    // servidor (expiração do JWT em `ACCESS_TOKEN_TTL_SECONDS` e `expiresAt` do refresh token no
    // banco) — isso aqui só controla até quando o NAVEGADOR guarda o cookie, nunca até quando ele
    // é válido.
    res.cookie(AUTH_COOKIE_NAME, session.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      domain,
      path: '/',
    });
    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      domain,
      path: '/auth',
    });
    // Cookie legível por JS de propósito: usado no padrão double-submit contra CSRF.
    res.cookie(CSRF_COOKIE_NAME, session.csrfToken, {
      httpOnly: false,
      secure,
      sameSite: 'strict',
      domain,
      path: '/',
    });
  }

  private clearSessionCookies(res: Response) {
    const domain = this.configService.get<string>('cookieDomain');
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/', domain });
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth', domain });
    res.clearCookie(CSRF_COOKIE_NAME, { path: '/', domain });
  }
}
