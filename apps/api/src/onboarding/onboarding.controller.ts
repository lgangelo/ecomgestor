import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { OnboardingService } from './onboarding.service';

/** Sem `@RequirePermissions` — qualquer usuário autenticado vê o próprio progresso de onboarding
 * da empresa (seção 64 da Fase 4). */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.onboardingService.getStatus(user.companyId);
  }
}
