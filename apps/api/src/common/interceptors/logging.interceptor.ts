import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AppLoggerService } from '../logger/app-logger.service';
import { RequestWithId } from '../middleware/request-context.middleware';

interface AuthenticatedRequest extends RequestWithId {
  user?: { userId: string };
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const started = Date.now();
    const operation = `${req.method} ${req.originalUrl ?? req.url}`;

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log('request_completed', {
            requestId: req.requestId,
            userId: req.user?.userId,
            operation,
            durationMs: Date.now() - started,
          });
        },
        error: () => {
          this.logger.warn('request_failed', {
            requestId: req.requestId,
            userId: req.user?.userId,
            operation,
            durationMs: Date.now() - started,
          });
        },
      }),
    );
  }
}
