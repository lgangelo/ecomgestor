import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@ecommerce-manager/shared';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Exige que o usuário autenticado possua TODAS as permissões informadas.
 * Nunca usar verificação por nome de role — sempre por permissão granular.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
