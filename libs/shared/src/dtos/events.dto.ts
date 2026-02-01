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

export enum DiscountProcessingStates {
  VALIDATING_ELIGIBILITY = 'VALIDATING_ELIGIBILITY',
  CHECKING_QUOTA = 'CHECKING_QUOTA',
  COMPENSATING = 'COMPENSATING',
  APPLYING_DISCOUNT = 'APPLYING_DISCOUNT',
  NO_DISCOUNT = 'NO_DISCOUNT',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

export class DiscountProcessingDto {
  bookingId: string;
  state: DiscountProcessingStates;
  message: string;
  traceId: string;
}
