export class ServiceItemDto {
  name: string;
  price: number;
}

export class BookingCreatedDto {
  bookingId: string;
  userName: string;
  userId: string;
  gender: string;
  dob: string; // Format: YYYY-MM-DD
  services: ServiceItemDto[];
  basePrice: number;
  traceId: string;
}

export class DiscountProcessedDto {
  bookingId: string;
  isAllowed: boolean;
  finalPrice: number;
  reason?: string;
  traceId: string;
}
