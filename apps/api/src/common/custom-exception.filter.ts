import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, domainHttpStatus } from './errors';

/** Error envelope for project-defined /api/v1 routes: { error: { code, message, details? } }. */
@Catch()
export class CustomApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('CustomApi');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof DomainError) {
      res.status(domainHttpStatus[exception.code]).json({
        error: { code: exception.code, message: exception.message, ...(exception.details ? { details: exception.details } : {}) },
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json({ error: { code: httpCode(status), message: exception.message } });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  }
}

function httpCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    default:
      return 'HTTP_' + status;
  }
}
