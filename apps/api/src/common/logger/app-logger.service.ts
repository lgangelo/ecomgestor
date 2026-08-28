import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { sanitizeForLog } from './sanitize';

export interface LogFields {
  requestId?: string;
  userId?: string;
  operation?: string;
  [key: string]: unknown;
}

/**
 * Logger estruturado em JSON. Cada linha contém timestamp, level, service, request_id,
 * user_id, operation e message — nunca dados sensíveis (ver sanitizeForLog).
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppLoggerService implements LoggerService {
  private context = 'Application';

  setContext(context: string) {
    this.context = context;
  }

  log(message: unknown, fields: LogFields = {}) {
    this.write('info', message, fields);
  }

  error(message: unknown, fields: LogFields = {}) {
    this.write('error', message, fields);
  }

  warn(message: unknown, fields: LogFields = {}) {
    this.write('warn', message, fields);
  }

  debug(message: unknown, fields: LogFields = {}) {
    this.write('debug', message, fields);
  }

  verbose(message: unknown, fields: LogFields = {}) {
    this.write('verbose', message, fields);
  }

  private write(level: string, message: unknown, fields: LogFields) {
    const entry = sanitizeForLog({
      timestamp: new Date().toISOString(),
      level,
      service: this.context,
      request_id: fields.requestId,
      user_id: fields.userId,
      operation: fields.operation,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...omit(fields, ['requestId', 'userId', 'operation']),
    });
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    // eslint-disable-next-line no-console
    else console.log(line);
  }
}

function omit(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!keys.includes(k)) out[k] = v;
  }
  return out;
}
