import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Skip if it's a BadRequestException (already handled by ValidationExceptionFilter)
    if (exception instanceof BadRequestException) {
      return;
    }

    // Handle all HttpExceptions (Nest built-ins like NotFoundException, ConflictException, etc.)
    if (exception instanceof HttpException) {
      return this.sendErrorResponse(response, request, exception);
    }

    // Fallback for unexpected errors
    console.error('Unexpected error: ', exception);

    const fallback = new InternalServerErrorException('Internal Server Error');
    this.sendErrorResponse(response, request, fallback);
  }

  private sendErrorResponse(
    response: Response,
    request: Request,
    exception: HttpException,
  ) {
    const status = exception.getStatus();
    const res = exception.getResponse() as
      | string
      | { message: string | string[]; error?: string; [key: string]: any };

    const message =
      typeof res === 'string'
        ? res
        : Array.isArray(res.message)
          ? res.message.join(', ')
          : res.message || exception.message;

    const error =
      typeof res === 'string' ? exception.name : res.error || exception.name;

    response.status(status).json({
      code: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
