import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface GoogleApiErrorShape {
  response?: { data?: { error?: { code?: number; message?: string; status?: string } } };
  status?: number;
  message: string;
}

// Duck-typed on purpose: gaxios is a transitive dependency pulled in separately by
// google-auth-library and @googleapis/forms, so `instanceof GaxiosError` is not
// reliable across their (potentially different) copies of the package.
function isGoogleApiError(exception: unknown): exception is GoogleApiErrorShape {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'response' in exception &&
    Boolean((exception as GoogleApiErrorShape).response?.data?.error)
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      this.logger.warn(`${status} ${exception.message}`);
      response.status(status).json(exception.getResponse());
      return;
    }

    if (isGoogleApiError(exception)) {
      const googleError = exception.response?.data?.error;
      const message = googleError?.message ?? exception.message;
      this.logger.error(
        `Google API rejected the request (${googleError?.status ?? exception.status ?? 'unknown'}): ${message}`,
      );
      response.status(HttpStatus.BAD_GATEWAY).json({
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'Bad Gateway',
        message: `Google API error: ${message}`,
      });
      return;
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(message, stack);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Unexpected server error',
    });
  }
}
