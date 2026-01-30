import {
  BOOKING_CREATED_EVENT,
  BookingCreatedDto,
  DiscountProcessedDto,
  RABBITMQ_SERVICE,
} from '@app/shared';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
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

    const savedBooking = await this.bookingRepo.save(newBooking);

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

    this.client.emit(BOOKING_CREATED_EVENT, event);

    return {
      message: 'Booking request received. Processing...',
      bookingId: savedBooking.id,
      status: 'PENDING',
    };
  }

  async getBookingStatus(id: string) {
    const booking = await this.bookingRepo.findOne({ where: { id } });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    return booking;
  }

  async handleDiscountResult(payload: DiscountProcessedDto) {
    const booking = await this.bookingRepo.findOne({
      where: { id: payload.bookingId },
    });

    if (!booking) {
      this.logger.error(
        `Critical: Result for unknown booking ${payload.bookingId}`,
      );
      return;
    }

    const history = booking.history || [];

    if (payload.isAllowed) {
      booking.status = BookingStatus.CONFIRMED;
      booking.finalPrice = payload.finalPrice;

      const statusMsg =
        payload.finalPrice < booking.basePrice
          ? 'Discount Applied'
          : 'Standard Price Approved';

      history.push(
        `[${new Date().toISOString()}] ${statusMsg}. Status: ${BookingStatus.CONFIRMED}`,
      );

      this.logger.log(
        `Booking ${payload.bookingId} CONFIRMED. (${statusMsg}) Final Price: $${payload.finalPrice}`,
      );
    } else {
      booking.status = BookingStatus.REJECTED;
      booking.failReason = payload.reason || null;
      booking.history.push(
        `[${new Date().toISOString()}] Failed: ${payload.reason}. Status: ${BookingStatus.REJECTED}`,
      );

      this.logger.warn(
        `Booking ${payload.bookingId} REJECTED. Reason: ${payload.reason}`,
      );
    }

    booking.history = history;

    await this.bookingRepo.save(booking);
  }
}
