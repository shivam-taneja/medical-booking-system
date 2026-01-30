import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { EntityNotFoundError, QueryFailedError, TypeORMError } from 'typeorm';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Skip if it's a BadRequestException (already handled by ValidationExceptionFilter)
    if (exception instanceof BadRequestException) {
      return;
    }

    if (exception instanceof TypeORMError) {
      const dbException = this.handleTypeORMError(exception);
      return this.sendErrorResponse(response, request, dbException);
    }

    // Handle all HttpExceptions (Nest built-ins like NotFoundException, ConflictException, etc.)
    if (exception instanceof HttpException) {
      return this.sendErrorResponse(response, request, exception);
    }

    // Fallback for unexpected errors
    this.logger.error(`Unexpected Error: `, exception);
    const fallback = new InternalServerErrorException('Internal Server Error');
    this.sendErrorResponse(response, request, fallback);
  }

  private handleTypeORMError(exception: TypeORMError) {
    if (exception instanceof QueryFailedError) {
      const driverError = exception.driverError as Record<string, unknown>;

      if (driverError?.code === '23505') {
        // Postgres Code 23505: Unique Constraint Violation
        return new ConflictException(
          'Record already exists (Unique Constraint Violation)',
        );
      }

      if (driverError?.code === '22P02') {
        // Postgres Code 22P02: Invalid Text Representation (e.g. Bad UUID format)
        return new BadRequestException(
          'Invalid input syntax (e.g. invalid UUID)',
        );
      }
    }

    if (exception instanceof EntityNotFoundError) {
      return new BadRequestException('Requested resource not found');
    }

    this.logger.error(`Database Error: `, exception);
    return new InternalServerErrorException('Database operation failed');
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
