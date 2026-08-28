import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AccessTokenPayload, AuthenticatedUser } from '../../auth/types/authenticated-user';
import { AUTH_COOKIE_NAME } from '@ecommerce-manager/shared';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.cookies?.[AUTH_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException('Sessão não encontrada. Faça login novamente.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.get<string>('jwtAccessSecret'),
      });
      request.user = {
        userId: payload.sub,
        email: payload.email,
        name: payload.name,
        companyId: payload.companyId,
        roles: payload.roles,
        permissions: payload.permissions,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Sessão expirada ou inválida.');
    }
  }
}
