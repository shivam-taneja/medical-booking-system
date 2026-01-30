import { DISCOUNT_QUEUE, RABBITMQ_SERVICE } from '@app/shared';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingController } from './booking.controller';
import { Booking } from './booking.entity';
import { BookingService } from './booking.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5435),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'dev_password'),
        database: configService.get<string>('DB_NAME', 'dev_db'),
        entities: [Booking],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([Booking]),

    ClientsModule.registerAsync([
      {
        name: RABBITMQ_SERVICE,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
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
              durable: true,
            },
            persistent: true,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
