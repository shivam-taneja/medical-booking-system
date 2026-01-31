import {
  BOOKING_CREATED_EVENT,
  BookingCreatedDto,
  DiscountProcessedDto,
  RABBITMQ_SERVICE,
  ServiceItemDto,
} from '@app/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { lastValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Booking, BookingStatus } from './booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';

const MEDICAL_SERVICES_DATA = [
  { name: 'General Consultation', price: 500, gender: 'All' },
  { name: 'Blood Test', price: 300, gender: 'All' },
  { name: 'X-Ray', price: 1200, gender: 'All' },
  { name: 'MRI Scan', price: 5000, gender: 'All' },
  { name: 'Dental Cleaning', price: 800, gender: 'All' },
  { name: 'Vaccination', price: 150, gender: 'All' },
  { name: 'Mammogram', price: 2000, gender: 'Female' },
  { name: 'Prostate Exam', price: 1500, gender: 'Male' },
];

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @Inject(RABBITMQ_SERVICE) private client: ClientProxy,
    @InjectRepository(Booking)
    private bookingRepo: Repository<Booking>,
  ) {}

  getAvailableServices(genderInput: string) {
    const gender = genderInput ? genderInput.toLowerCase() : 'all';

    return MEDICAL_SERVICES_DATA.filter((s) => {
      if (s.gender === 'All') return true;
      if (gender === 'male' && s.gender === 'Male') return true;
      if (gender === 'female' && s.gender === 'Female') return true;

      return false;
    });
  }

  async createBooking(data: CreateBookingDto) {
    const userId = uuidv4();
    const traceId = uuidv4();
    this.logger.log(
      `[TraceID: ${traceId}] Incoming booking request for user ${userId}`,
    );

    const validServices = this.getAvailableServices(data.gender);
    const selectedServices: ServiceItemDto[] = [];

    for (const name of data.serviceNames) {
      const serviceDef = validServices.find((s) => s.name === name);

      if (!serviceDef) {
        throw new BadRequestException(
          `Service '${name}' is not available for gender '${data.gender}'`,
        );
      }

      selectedServices.push({ name: serviceDef.name, price: serviceDef.price });
    }

    const basePrice = selectedServices.reduce((sum, s) => sum + s.price, 0);
    const initialHistory = [
      `[${new Date().toISOString()}] Booking Created (Pending)`,
    ];

    const newBooking = this.bookingRepo.create({
      userId: userId,
      userName: data.userName,
      gender: data.gender,
      dob: data.dob,
      services: selectedServices,
      basePrice,
      status: BookingStatus.PENDING,
      history: initialHistory,
    });

    const savedBooking = await this.bookingRepo.save(newBooking);

    this.logger.log(
      `[TraceID: ${traceId}] Booking ${savedBooking.id} saved. Emitting event...`,
    );

    const event: BookingCreatedDto = {
      bookingId: savedBooking.id,
      userId: userId,
      gender: data.gender,
      dob: data.dob,
      services: selectedServices,
      basePrice,
      traceId,
    };

    try {
      await lastValueFrom(this.client.emit(BOOKING_CREATED_EVENT, event));

      return {
        message: 'Booking request received. Processing...',
        bookingId: savedBooking.id,
        traceId,
        status: 'PENDING',
      };
    } catch (error) {
      // If emit failed, we delete the booking
      // to prevent a "Ghost Booking" that stays PENDING forever.
      this.logger.error(
        `[TraceID: ${traceId}] Failed to emit event. Rolling back.`,
      );

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
    const { traceId, bookingId, isAllowed, finalPrice, reason } = payload;
    const logPrefix = traceId ? `[TraceID: ${traceId}]` : '';

    this.logger.log(`${logPrefix} Processing discount result for ${bookingId}`);

    const status = payload.isAllowed
      ? BookingStatus.CONFIRMED
      : BookingStatus.REJECTED;
    const failReason = payload.reason || null;

    const logEntry = isAllowed
      ? `[${new Date().toISOString()}] Confirmed. Price: ${finalPrice}`
      : `[${new Date().toISOString()}] Rejected: ${reason}`;

    const booking = await this.bookingRepo.findOne({
      where: { id: payload.bookingId },
    });

    if (!booking) {
      this.logger.error(`${logPrefix} Critical: Unknown booking ${bookingId}`);
      return;
    }

    if (booking.status !== BookingStatus.PENDING) {
      this.logger.warn(
        `${logPrefix} Booking ${booking.id} is already ${booking.status}. Ignoring.`,
      );
      return;
    }

    booking.status = status;
    booking.finalPrice = finalPrice;
    booking.failReason = failReason;
    booking.history.push(logEntry);

    await this.bookingRepo.save(booking);

    this.logger.log(`${logPrefix} Booking ${booking.id} updated to ${status}`);
  }
}
