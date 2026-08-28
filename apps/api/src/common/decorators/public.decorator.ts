import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca uma rota como pública, dispensando o JwtAuthGuard global (ex: login, health checks). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
