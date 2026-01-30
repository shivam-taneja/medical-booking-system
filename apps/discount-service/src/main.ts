import { DISCOUNT_QUEUE } from '@app/shared';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DiscountModule } from './discount.module';

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(DiscountModule);
  const configService = appContext.get(ConfigService);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    DiscountModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [
          configService.get<string>(
            'RABBITMQ_URL',
            'amqp://user:password@localhost:5672',
          ),
        ],
        queue: DISCOUNT_QUEUE,
        queueOptions: {
          durable: false,
        },
        noAck: false, // We handle Ack manually
      },
    },
  );

  await app.listen();
  console.log('Discount Service is listening for events...');
}
bootstrap();
