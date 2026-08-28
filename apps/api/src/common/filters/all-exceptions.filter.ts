import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { AppLoggerService } from '../logger/app-logger.service';
import { RequestWithId } from '../middleware/request-context.middleware';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  requestId?: string;
  path: string;
  timestamp: string;
}

/**
 * Filtro global de exceções. Centraliza o formato de erro da API e garante que
 * detalhes internos (stack traces, mensagens de driver do banco) nunca cheguem ao cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext('ExceptionFilter');
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno do servidor.';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? error;
      }
    } else if (exception instanceof Error) {
      error = exception.name;
    }

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception, {
        requestId: request?.requestId,
        operation: `${request?.method} ${request?.originalUrl}`,
      });
      message = 'Erro interno do servidor.';
      error = 'Internal Server Error';
    }

    const body: ErrorBody = {
      statusCode: status,
      message,
      error,
      requestId: request?.requestId,
      path: request?.originalUrl,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }
}
