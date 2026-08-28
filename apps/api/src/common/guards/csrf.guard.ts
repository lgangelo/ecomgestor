import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@ecommerce-manager/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção CSRF via double-submit cookie: o cookie ecm_csrf_token (não HttpOnly) é
 * espelhado pelo frontend no header x-csrf-token em toda requisição que muda estado.
 * Um atacante em outro domínio não consegue ler o cookie para replicar o header.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();

    if (isPublic || SAFE_METHODS.has(request.method)) return true;

    const cookieToken = request.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = request.headers[CSRF_HEADER_NAME];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('Token CSRF ausente ou inválido.');
    }
    return true;
  }
}
