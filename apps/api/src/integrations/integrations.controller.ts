import { Controller, Get, NotImplementedException, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { IntegrationProvider } from '@ecommerce-manager/database';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { IntegrationsService } from './integrations.service';

const NOT_IMPLEMENTED_MESSAGE: Record<IntegrationProvider, string> = {
  TIKTOK_SHOP: 'Integração com TikTok Shop será implementada em uma etapa futura.',
  SHOPEE: 'Integração em breve — ainda não disponível.',
  MERCADO_LIVRE: 'Integração em breve — ainda não disponível.',
};

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.findAll(user.companyId);
  }

  @Get(':provider')
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider', new ParseEnumPipe(IntegrationProvider)) provider: IntegrationProvider,
  ) {
    return this.integrationsService.findOne(user.companyId, provider);
  }

  @Post(':provider/connect')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  connect(@Param('provider', new ParseEnumPipe(IntegrationProvider)) provider: IntegrationProvider) {
    throw new NotImplementedException(NOT_IMPLEMENTED_MESSAGE[provider]);
  }

  @Post(':provider/sync')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  sync(@Param('provider', new ParseEnumPipe(IntegrationProvider)) provider: IntegrationProvider) {
    throw new NotImplementedException(NOT_IMPLEMENTED_MESSAGE[provider]);
  }

  @Post(':provider/reconnect')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  reconnect(@Param('provider', new ParseEnumPipe(IntegrationProvider)) provider: IntegrationProvider) {
    throw new NotImplementedException(NOT_IMPLEMENTED_MESSAGE[provider]);
  }

  @Post(':provider/disconnect')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  disconnect(@Param('provider', new ParseEnumPipe(IntegrationProvider)) provider: IntegrationProvider) {
    throw new NotImplementedException(NOT_IMPLEMENTED_MESSAGE[provider]);
  }
}
