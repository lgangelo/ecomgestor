import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionKey } from '@ecommerce-manager/shared';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

/**
 * Autorização por permissão granular. NUNCA decide acesso pelo nome da role —
 * sempre pelo conjunto de permissões efetivas do usuário autenticado.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const userPermissions = new Set(request.user?.permissions ?? []);

    const missing = required.filter((p) => !userPermissions.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Permissão insuficiente. Necessário: ${missing.join(', ')}.`,
      );
    }
    return true;
  }
}
