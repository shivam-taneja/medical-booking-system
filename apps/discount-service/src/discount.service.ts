import {
  BookingCreatedDto,
  DISCOUNT_PROCESSED_EVENT,
  DiscountProcessedDto,
  RABBITMQ_SERVICE,
} from '@app/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import Redis from 'ioredis';

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);
  private readonly redis: Redis;
  private readonly TIMEZONE = 'Asia/Kolkata';

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
    this.logger.log(
      `Processing discount logic for Booking ${data.bookingId}...`,
    );

    let isAllowed = true;
    let finalPrice = data.basePrice;
    let reason = '';

    const bannedUser = this.configService.get<string>(
      'BANNED_USER',
      'invalid_user',
    );

    if (data.userId === bannedUser) {
      this.logger.warn(
        `Booking ${data.bookingId} REJECTED: User ${bannedUser} is banned.`,
      );

      this.client.emit(DISCOUNT_PROCESSED_EVENT, {
        bookingId: data.bookingId,
        isAllowed: false,
        finalPrice: data.basePrice,
        reason: 'User is not authorized to make bookings (Simulated Failure)',
      });
      return;
    }

    const now = new Date();
    const nowIST = toZonedTime(now, this.TIMEZONE);

    // RULE R1: Female Birthday OR High Value
    const isFemale = data.gender.toLowerCase() === 'female';
    const isBirthday = this.checkBirthday(data.dob, nowIST);
    const isHighValue = data.basePrice > 1000;

    const qualifiesForDiscount = (isFemale && isBirthday) || isHighValue;

    if (qualifiesForDiscount) {
      this.logger.log(
        `Booking ${data.bookingId} qualifies for R1 Discount. Checking Quota...`,
      );

      const todayString = format(nowIST, 'yyyy-MM-dd');
      const redisKey = `discount_quota:${todayString}`;

      const currentCount = await this.redis.incr(redisKey);
      const limit = this.configService.get<number>('R2_QUOTA_LIMIT', 100);

      this.logger.log(
        `Daily Quota Check [${todayString}]: ${currentCount}/${limit}`,
      );

      if (currentCount > limit) {
        isAllowed = false;
        reason = 'Daily discount quota reached. Please try again tomorrow.';
        this.logger.warn(`Booking ${data.bookingId} REJECTED: ${reason}`);
      } else {
        // Apply 12% Discount
        finalPrice = Math.floor(data.basePrice * 0.88);
        this.logger.log(`Discount Applied! Final Price: ${finalPrice}`);
      }
    } else {
      this.logger.log(
        `Booking ${data.bookingId} does not qualify for discount. Proceeding with Standard Price.`,
      );
      isAllowed = true;
      finalPrice = data.basePrice;
    }

    const result: DiscountProcessedDto = {
      bookingId: data.bookingId,
      isAllowed,
      finalPrice,
      reason,
    };

    this.client.emit(DISCOUNT_PROCESSED_EVENT, result);
  }

  private checkBirthday(dobString: string, todayIST: Date): boolean {
    const dob = new Date(dobString);

    // Compare Month and Date
    return (
      todayIST.getDate() === dob.getDate() &&
      todayIST.getMonth() === dob.getMonth()
    );
  }
}
