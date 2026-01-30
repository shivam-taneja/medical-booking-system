import { DISCOUNT_PROCESSED_EVENT, DiscountProcessedDto } from '@app/shared';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Channel, Message } from 'amqplib';
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

  @EventPattern(DISCOUNT_PROCESSED_EVENT)
  handleDiscountProcessed(
    @Payload() data: DiscountProcessedDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef() as Channel;
    const originalMsg = context.getMessage() as Message;

    try {
      this.bookingService.handleDiscountResult(data);

      channel.ack(originalMsg);
    } catch {
      channel.nack(originalMsg);
    }
  }
}
