import { Controller, Get } from '@nestjs/common';
import { DiscountServiceService } from './discount-service.service';

@Controller()
export class DiscountServiceController {
  constructor(
    private readonly discountServiceService: DiscountServiceService,
  ) {}

  @Get()
  getHello(): string {
    return this.discountServiceService.getHello();
  }
}
