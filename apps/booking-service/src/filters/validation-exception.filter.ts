import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as {
      message: string | string[];
    };

    // Check if this is a validation error
    if (exceptionResponse.message && Array.isArray(exceptionResponse.message)) {
      return response.status(status).json({
        code: status,
        timestamp: new Date().toISOString(),
        message: 'Validation failed',
        error: exceptionResponse.message,
      });
    }

    // For other BadRequestExceptions, use the standard format
    response.status(status).json({
      code: status,
      timestamp: new Date().toISOString(),
      message: exception.message,
      error: exception.name,
    });
  }
}
