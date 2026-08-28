import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export interface RequestWithId extends Request {
  requestId: string;
}

/** Garante que toda requisição possua um request_id, propagado nos logs e na resposta. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    req.requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  }
}
