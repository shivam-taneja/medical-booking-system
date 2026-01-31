import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from './booking.entity';

@Injectable()
export class BookingTimeoutService {
  private readonly logger = new Logger(BookingTimeoutService.name);
  private readonly THRESHOLD_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(Booking)
    private bookingRepo: Repository<Booking>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleTimeout() {
    const timeoutThreshold = new Date(Date.now() - this.THRESHOLD_TTL);
    const logEntry = `[${new Date().toISOString()}] System Timeout.`;

    const result = await this.bookingRepo
      .createQueryBuilder()
      .update(Booking)
      .set({
        status: BookingStatus.REJECTED,
        failReason: 'System timeout: Discount service did not respond',

        // Atomically append to JSONB array
        // This takes the current 'history' column and concatenates (||) the new entry
        history: () => `history || '["${logEntry}"]'::jsonb`,
      })
      .where('status = :pendingStatus', {
        pendingStatus: BookingStatus.PENDING,
      })
      .andWhere('createdAt < :threshold', { threshold: timeoutThreshold })
      .returning('id') // Returns the IDs that were actually updated
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.warn(`Processed timeout for ${result.affected} bookings`);
    }
  }
}
