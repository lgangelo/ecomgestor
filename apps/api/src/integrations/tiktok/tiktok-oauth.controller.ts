import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { TikTokOAuthService } from './tiktok-oauth.service';

@Controller('integrations/tiktok')
export class TikTokOAuthController {
  constructor(private readonly oauth: TikTokOAuthService) {}

  @Get('connect')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_CONNECT)
  async connect(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const url = await this.oauth.buildConnectUrl(user.companyId, user.userId);
    res.redirect(url);
  }

  // Rota pública: ver o comentário em tiktok-oauth.service.ts — o cookie de sessão
  // (SameSite=Strict) não acompanha esta navegação de retorno vinda de tiktokshop.com; a
  // segurança desta rota vem inteiramente da validação do `state` de uso único.
  @Get('callback')
  @Public()
  async callback(@Query('state') state: string, @Query('code') code: string, @Req() req: Request, @Res() res: Response) {
    const { webAppUrl } = await this.oauth.handleCallback(state, code, req.ip);
    res.redirect(`${webAppUrl}/integracoes/tiktok?connected=1`);
  }

  @Post('disconnect')
  @RequirePermissions(PERMISSIONS.INTEGRATION_TIKTOK_CONNECT)
  async disconnect(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    await this.oauth.disconnect(user.companyId, user.userId, req.ip);
    return { status: 'DISCONNECTED' };
  }
}
