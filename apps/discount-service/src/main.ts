import { NestFactory } from '@nestjs/core';
import { DiscountServiceModule } from './discount-service.module';

async function bootstrap() {
  const app = await NestFactory.create(DiscountServiceModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
