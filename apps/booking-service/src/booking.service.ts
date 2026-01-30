import {
  BOOKING_CREATED_EVENT,
  BookingCreatedDto,
  DiscountProcessedDto,
  RABBITMQ_SERVICE,
} from '@app/shared';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { lastValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from './booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @Inject(RABBITMQ_SERVICE) private client: ClientProxy,
    @InjectRepository(Booking)
    private bookingRepo: Repository<Booking>,
  ) {}

  async createBooking(data: CreateBookingDto) {
    const basePrice = data.services.reduce((sum, s) => sum + s.price, 0);
    const initialHistory = [
      `[${new Date().toISOString()}] Booking Created (Pending)`,
    ];

    const newBooking = this.bookingRepo.create({
      userId: data.userId,
      gender: data.gender,
      dob: data.dob,
      services: data.services,
      basePrice,
      status: BookingStatus.PENDING,
      history: initialHistory,
    });

    let savedBooking: Booking | null = null;

    try {
      savedBooking = await this.bookingRepo.save(newBooking);

      this.logger.log(
        `Booking ${savedBooking.id} saved as PENDING. Emitting event to Discount Service...`,
      );

      const event: BookingCreatedDto = {
        bookingId: savedBooking.id,
        userId: data.userId,
        gender: data.gender,
        dob: data.dob,
        services: data.services,
        basePrice,
      };

      await lastValueFrom(this.client.emit(BOOKING_CREATED_EVENT, event));

      return {
        message: 'Booking request received. Processing...',
        bookingId: savedBooking.id,
        status: 'PENDING',
      };
    } catch (error) {
      // If emit failed, we delete the booking
      // to prevent a "Ghost Booking" that stays PENDING forever.

      if (savedBooking && savedBooking.id) {
        await this.bookingRepo.delete(savedBooking.id);
      }

      throw error;
    }
  }

  async getBookingStatus(id: string) {
    const booking = await this.bookingRepo.findOne({ where: { id } });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    return booking;
  }

  async handleDiscountResult(payload: DiscountProcessedDto) {
    const status = payload.isAllowed
      ? BookingStatus.CONFIRMED
      : BookingStatus.REJECTED;
    const failReason = payload.reason || null;
    const finalPrice = payload.finalPrice;

    const logEntry = payload.isAllowed
      ? `[${new Date().toISOString()}] Discount Processed. Status: ${BookingStatus.CONFIRMED}. Price: ${finalPrice}`
      : `[${new Date().toISOString()}] Failed: ${payload.reason}. Status: ${BookingStatus.REJECTED}`;

    const booking = await this.bookingRepo.findOne({
      where: { id: payload.bookingId },
    });

    if (!booking) {
      this.logger.error(
        `Critical: Result for unknown booking ${payload.bookingId}`,
      );
      return;
    }

    if (booking.status !== BookingStatus.PENDING) {
      this.logger.warn(
        `Booking ${booking.id} is not PENDING (Current: ${booking.status}). Ignoring Discount result.`,
      );
      return;
    }

    booking.status = status;
    booking.finalPrice = finalPrice;
    booking.failReason = failReason;
    booking.history.push(logEntry);

    await this.bookingRepo.save(booking);

    this.logger.log(`Booking ${booking.id} updated to ${status}`);
  }
}
