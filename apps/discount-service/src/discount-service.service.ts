import { Injectable } from '@nestjs/common';

@Injectable()
export class DiscountServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
