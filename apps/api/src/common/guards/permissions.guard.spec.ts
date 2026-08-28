import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

function buildContext(user: { permissions: string[] } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('allows access when the route has no required permissions', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(buildContext({ permissions: [] }))).toBe(true);
  });

  it('allows access when the user has every required permission', () => {
    const reflector = {
      getAllAndOverride: () => ['product.read', 'product.update'],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const context = buildContext({ permissions: ['product.read', 'product.update', 'order.read'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access when the user is missing a required permission', () => {
    const reflector = {
      getAllAndOverride: () => ['users.manage'],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const context = buildContext({ permissions: ['product.read'] });
    expect(() => guard.canActivate(context)).toThrow();
  });

  it('denies access when there is no authenticated user at all', () => {
    const reflector = {
      getAllAndOverride: () => ['product.read'],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow();
  });
});
