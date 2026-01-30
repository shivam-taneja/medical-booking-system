import { Module } from '@nestjs/common';
import { DiscountServiceController } from './discount-service.controller';
import { DiscountServiceService } from './discount-service.service';

@Module({
  imports: [],
  controllers: [DiscountServiceController],
  providers: [DiscountServiceService],
})
export class DiscountServiceModule {}
