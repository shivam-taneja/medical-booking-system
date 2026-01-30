import { ServiceItemDto } from '@app/shared';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

    this.logger.log(`Booking ${bookingId} saved as PENDING.`);

    // TODO: emmit event for discount service

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
}
