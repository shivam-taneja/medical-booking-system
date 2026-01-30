import {
  BookingCreatedDto,
  DISCOUNT_PROCESSED_EVENT,
  DiscountProcessedDto,
  RABBITMQ_SERVICE,
} from '@app/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import Redis from 'ioredis';

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);
  private readonly redis: Redis;

  constructor(
    @Inject(RABBITMQ_SERVICE) private client: ClientProxy,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6375),
    });
  }

  async processDiscount(data: BookingCreatedDto) {
    this.logger.log(`Processing discount for Booking ${data.bookingId}...`);

    let isAllowed = true;
    let finalPrice = data.basePrice;
    let reason = '';

    // RULE R1: Female Birthday OR High Value
    const isFemale = data.gender.toLowerCase() === 'female';
    const isBirthday = this.checkBirthday(data.dob);
    const isHighValue = data.basePrice > 1000;

    const qualifiesForDiscount = (isFemale && isBirthday) || isHighValue;

    if (qualifiesForDiscount) {
      // RULE R2: Check System-Wide Daily Quota
      const today = new Date().toISOString().split('T')[0];
      const redisKey = `discount_quota:${today}`;

      const currentCount = await this.redis.incr(redisKey);

      const limit = this.configService.get<number>('R2_QUOTA_LIMIT', 100);

      if (currentCount > limit) {
        isAllowed = false;
        reason = 'Daily discount quota reached. Please try again tomorrow.';
      } else {
        // Apply 12% Discount
        finalPrice = Math.floor(data.basePrice * 0.88);
        this.logger.log(`Discount Applied! New Price: ${finalPrice}`);
      }
    } else {
      this.logger.log('User does not qualify for R1 Discount.');
    }

    const result: DiscountProcessedDto = {
      bookingId: data.bookingId,
      isAllowed,
      finalPrice,
      reason,
    };

    this.client.emit(DISCOUNT_PROCESSED_EVENT, result);
  }

  private checkBirthday(dobString: string): boolean {
    const today = new Date();
    const dob = new Date(dobString);

    return (
      today.getDate() === dob.getDate() && today.getMonth() === dob.getMonth()
    );
  }
}
