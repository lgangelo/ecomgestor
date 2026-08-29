import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** Sem `@RequirePermissions` — todo usuário autenticado pode buscar; cada seção do resultado é
   * filtrada internamente pela permissão de leitura do próprio domínio (seção 37-39). */
  @Get()
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchQueryDto) {
    return this.searchService.search(user.companyId, user.permissions, query.q);
  }
}
