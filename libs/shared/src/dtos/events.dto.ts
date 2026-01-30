export class ServiceItemDto {
  name: string;
  price: number;
}

export class BookingCreatedDto {
  bookingId: string;
  userId: string;
  gender: string;
  dob: string; // Format: YYYY-MM-DD
  services: ServiceItemDto[];
  basePrice: number;
}

export class DiscountProcessedDto {
  bookingId: string;
  isAllowed: boolean;
  finalPrice: number;
  reason?: string;
}
