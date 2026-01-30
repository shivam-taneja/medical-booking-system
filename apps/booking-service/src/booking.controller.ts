import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  create(@Body() body: CreateBookingDto) {
    return this.bookingService.createBooking(body);
  }

  @Get(':id')
  getStatus(@Param('id') id: string) {
    return this.bookingService.getBookingStatus(id);
  }

  // TODO: Listen for the result from Discount Service
}
