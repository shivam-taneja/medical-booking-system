import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
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

    const staleBookings = await this.bookingRepo.find({
      where: {
        status: BookingStatus.PENDING,
        createdAt: LessThan(timeoutThreshold),
      },
    });

    for (const booking of staleBookings) {
      this.logger.warn(`Timing out stale booking: ${booking.id}`);

      booking.status = BookingStatus.REJECTED;
      booking.failReason = 'System timeout: Discount service did not respond.';
      booking.history.push(`[${new Date().toISOString()}] System Timeout.`);

      await this.bookingRepo.save(booking);
    }
  }
}
