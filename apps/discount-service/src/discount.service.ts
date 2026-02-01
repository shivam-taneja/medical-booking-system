import {
  BookingCreatedDto,
  DISCOUNT_PROCESSED_EVENT,
  DISCOUNT_PROCESSING_EVENT,
  DiscountProcessedDto,
  DiscountProcessingDto,
  DiscountProcessingStates,
  RABBITMQ_SERVICE,
} from '@app/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { format, isValid, parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import Redis from 'ioredis';
import { lastValueFrom } from 'rxjs';

type DiscountProcessingContext = {
  finalPrice: number;
  isAllowed: boolean;
  reason: string;
  quotaConsumed: boolean;
  redisKey: string;
  idempotencyKey: string;
};

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);
  private readonly redis: Redis;
  private readonly TIMEZONE = 'Asia/Kolkata';
  private readonly IDEMPOTENCY_TTL = 86400; // 24 hours

  constructor(
    @Inject(RABBITMQ_SERVICE) private client: ClientProxy,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6375),

      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
  }

  async processDiscount(data: BookingCreatedDto) {
    const { bookingId, traceId } = data;
    const logPrefix = `[TraceID: ${traceId}]`;

    const context: DiscountProcessingContext = {
      finalPrice: data.basePrice,
      isAllowed: true,
      reason: '',
      quotaConsumed: false,
      redisKey: '',
      idempotencyKey: `processed_booking:${bookingId}`,
    };

    try {
      await this.acquireIdempotencyLock(
        context.idempotencyKey,
        bookingId,
        traceId,
      );
      await this.validateEligibility(data, bookingId, traceId, context);
      await this.processQuotaAndDiscount(
        data,
        bookingId,
        traceId,
        logPrefix,
        context,
      );
      await this.emitResult({
        bookingId,
        isAllowed: context.isAllowed,
        finalPrice: context.finalPrice,
        reason: context.reason,
        traceId,
      });
    } catch (err) {
      await this.handleSystemFailure(bookingId, traceId, context);
      throw err;
    }
  }

  private async acquireIdempotencyLock(
    key: string,
    bookingId: string,
    traceId: string,
  ) {
    try {
      const result = await this.redis.set(
        key,
        '1',
        'EX',
        this.IDEMPOTENCY_TTL,
        'NX',
      );

      if (!result) {
        throw new Error('Duplicate event');
      }
    } catch (e) {
      await this.emitIntermediaryState({
        bookingId,
        state: DiscountProcessingStates.SYSTEM_ERROR,
        message: 'Redis unavailable during idempotency check',
        traceId,
      });
      throw e;
    }
  }

  private async validateEligibility(
    data: BookingCreatedDto,
    bookingId: string,
    traceId: string,
    context: DiscountProcessingContext,
  ) {
    await this.emitIntermediaryState({
      bookingId,
      state: DiscountProcessingStates.VALIDATING_ELIGIBILITY,
      message: 'Validating discount eligibility...',
      traceId,
    });

    const bannedUser = this.configService.get<string>(
      'BANNED_USER',
      'invalid_user',
    );

    if (data.userName === bannedUser) {
      context.isAllowed = false;
      context.reason = 'User is not authorized (Simulated Failure)';

      await this.emitResult({
        bookingId,
        isAllowed: false,
        finalPrice: data.basePrice,
        reason: context.reason,
        traceId,
      });

      throw new Error('Banned user');
    }
  }

  private async processQuotaAndDiscount(
    data: BookingCreatedDto,
    bookingId: string,
    traceId: string,
    logPrefix: string,
    context: DiscountProcessingContext,
  ) {
    const nowIST = toZonedTime(new Date(), this.TIMEZONE);

    const qualifies =
      (data.gender.toLowerCase() === 'female' &&
        this.checkBirthday(data.dob, nowIST, logPrefix)) ||
      data.basePrice > 1000;

    if (!qualifies) {
      await this.emitIntermediaryState({
        bookingId,
        state: DiscountProcessingStates.NO_DISCOUNT,
        message: 'No discount applicable',
        traceId,
      });
      return;
    }

    await this.emitIntermediaryState({
      bookingId,
      state: DiscountProcessingStates.CHECKING_QUOTA,
      message: 'Checking daily discount quota availability...',
      traceId,
    });

    const today = format(nowIST, 'yyyy-MM-dd');
    context.redisKey = `discount_quota:${today}`;

    let count: number;

    try {
      count = await this.redis.incr(context.redisKey);
      context.quotaConsumed = true;
      if (count === 1) {
        await this.redis.expire(context.redisKey, 86400 * 2);
      }
    } catch (e) {
      await this.emitIntermediaryState({
        bookingId,
        state: DiscountProcessingStates.SYSTEM_ERROR,
        message: 'Redis unavailable during quota increment',
        traceId,
      });
      throw e;
    }

    const limit = this.configService.get<number>('R2_QUOTA_LIMIT', 100);

    if (count > limit) {
      context.isAllowed = false;
      context.reason =
        'Daily discount quota reached. Please try again tomorrow.';

      await this.emitIntermediaryState({
        bookingId,
        state: DiscountProcessingStates.COMPENSATING,
        message: 'Quota exceeded - rolling back quota',
        traceId,
      });

      try {
        await this.redis.decr(context.redisKey);
        context.quotaConsumed = false;
        // eslint-disable-next-line no-empty
      } catch {}

      return;
    }

    await this.emitIntermediaryState({
      bookingId,
      state: DiscountProcessingStates.APPLYING_DISCOUNT,
      message: `Applying 12% discount (${count}/${limit})`,
      traceId,
    });

    context.finalPrice = Math.round(data.basePrice * 0.88);
  }

  private async handleSystemFailure(
    bookingId: string,
    traceId: string,
    context: DiscountProcessingContext,
  ) {
    if (context.quotaConsumed && context.redisKey) {
      try {
        await this.emitIntermediaryState({
          bookingId,
          state: DiscountProcessingStates.COMPENSATING,
          message: 'System error - rolling back quota',
          traceId,
        });
        await this.redis.decr(context.redisKey);
        // eslint-disable-next-line no-empty
      } catch {}
    }

    try {
      await this.redis.del(context.idempotencyKey);
      // eslint-disable-next-line no-empty
    } catch {}
  }

  async emitResult(payload: DiscountProcessedDto) {
    await lastValueFrom(this.client.emit(DISCOUNT_PROCESSED_EVENT, payload));
  }

  private async emitIntermediaryState(payload: DiscountProcessingDto) {
    await lastValueFrom(this.client.emit(DISCOUNT_PROCESSING_EVENT, payload));
  }

  private checkBirthday(
    dobString: string,
    todayIST: Date,
    logPrefix: string,
  ): boolean {
    try {
      const dob = parse(dobString, 'yyyy-MM-dd', new Date());

      if (!isValid(dob)) {
        this.logger.warn(
          `${logPrefix} Invalid DOB format received: ${dobString}. Defaulting to no discount.`,
        );
        return false;
      }

      const currentMonth = todayIST.getMonth(); // 0-indexed (Jan = 0)
      const currentDay = todayIST.getDate();

      return dob.getDate() === currentDay && dob.getMonth() === currentMonth;
    } catch (error) {
      this.logger.error(`${logPrefix} Error parsing DOB: ${dobString}`, error);
      return false;
    }
  }
}
