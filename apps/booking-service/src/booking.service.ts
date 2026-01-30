import {
  BOOKING_CREATED_EVENT,
  BookingCreatedDto,
  DiscountProcessedDto,
  RABBITMQ_SERVICE,
  ServiceItemDto,
} from '@app/shared';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import { CreateBookingDto } from './dto/create-booking.dto';

enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

export interface BookingRecord {
  id: string;
  userId: string;
  gender: string;
  dob: string;
  services: ServiceItemDto[];
  basePrice: number;
  finalPrice?: number;
  status: BookingStatus;
  failReason?: string;
  history: string[];
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  private bookings = new Map<string, BookingRecord>();

  constructor(@Inject(RABBITMQ_SERVICE) private client: ClientProxy) {}

  createBooking(data: CreateBookingDto) {
    const bookingId = uuidv4();

    // Calculate Base Price (Sum of all service prices)
    const basePrice = data.services.reduce((sum, s) => sum + s.price, 0);

    const bookingRecord: BookingRecord = {
      id: bookingId,
      userId: data.userId,
      gender: data.gender,
      dob: data.dob,
      services: data.services,
      basePrice,
      status: BookingStatus.PENDING,
      history: [`[${new Date().toISOString()}] Booking Created (Pending)`],
    };

    this.bookings.set(bookingId, bookingRecord);

    this.logger.log(
      `Booking ${bookingId} saved as PENDING. Event ${BOOKING_CREATED_EVENT} emmited.`,
    );

    const event: BookingCreatedDto = {
      bookingId,
      userId: data.userId,
      gender: data.gender,
      dob: data.dob,
      services: data.services,
      basePrice,
    };

    this.client.emit(BOOKING_CREATED_EVENT, event);

    return {
      message: 'Booking request received. Processing...',
      bookingId,
      status: 'PENDING',
    };
  }

  getBookingStatus(id: string): BookingRecord {
    const booking = this.bookings.get(id);
    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    return booking;
  }

  handleDiscountResult(payload: DiscountProcessedDto) {
    const booking = this.bookings.get(payload.bookingId);

    if (!booking) {
      this.logger.error(
        `Critical: Received result for unknown booking ${payload.bookingId}`,
      );
      return;
    }

    if (payload.isAllowed) {
      booking.status = BookingStatus.CONFIRMED;
      booking.finalPrice = payload.finalPrice;
      booking.history.push(
        `[${new Date().toISOString()}] Discount Applied. Status: ${BookingStatus.CONFIRMED}`,
      );

      this.logger.log(
        `Booking ${payload.bookingId} CONFIRMED. Final Price: $${payload.finalPrice}`,
      );
    } else {
      booking.status = BookingStatus.REJECTED;
      booking.failReason = payload.reason;
      booking.history.push(
        `[${new Date().toISOString()}] Failed: ${payload.reason}. Status: ${BookingStatus.REJECTED}`,
      );

      this.logger.warn(
        `Booking ${payload.bookingId} REJECTED. Reason: ${payload.reason}`,
      );
    }

    this.bookings.set(payload.bookingId, booking);
  }
}
