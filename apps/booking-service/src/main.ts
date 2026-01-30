import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { BookingModule } from './booking.module';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { ValidationExceptionFilter } from './filters/validation-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(BookingModule);
  const configService = app.get(ConfigService);

  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new ValidationExceptionFilter(),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = configService.get<number>('BOOKING_PORT') || 3000;
  await app.listen(port);
  console.log(`Booking Service is running on HTTP port ${port}`);
}
bootstrap();
