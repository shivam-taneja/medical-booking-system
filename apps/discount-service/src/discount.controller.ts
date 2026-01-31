import { BOOKING_CREATED_EVENT, BookingCreatedDto } from '@app/shared';
import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Channel, Message } from 'amqplib';
import { DiscountService } from './discount.service';

@Controller()
export class DiscountController {
  private readonly logger = new Logger(DiscountController.name);

  constructor(private readonly discountService: DiscountService) {}

  @EventPattern(BOOKING_CREATED_EVENT)
  async handleBookingCreated(
    @Payload() data: BookingCreatedDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef() as Channel;
    const originalMsg = context.getMessage() as Message;

    try {
      this.logger.log(`Received Booking Event: ${data.bookingId}`);

      await this.discountService.processDiscount(data);

      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(`Error processing booking: ${error}`);

      await this.discountService.emitResult({
        bookingId: data.bookingId,
        isAllowed: false,
        finalPrice: data.basePrice,
        reason: 'Internal System Error (Discount Service Failed)',
        traceId: data.traceId,
      });

      // 2nd arg false = global (ignore),
      // 3rd arg false = requeue (false means DISCARD/Send to DLQ)
      // This prevents the infinite loop of crashing/restarting on the same message.
      channel.nack(originalMsg, false, false);
    }
  }
}
