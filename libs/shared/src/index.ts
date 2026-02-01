export * from './dtos/events.dto';

export const RABBITMQ_SERVICE = 'RABBITMQ_SERVICE';

export const BOOKING_QUEUE = 'booking_queue';
export const DISCOUNT_QUEUE = 'discount_queue';

export const BOOKING_CREATED_EVENT = 'booking_created';
export const DISCOUNT_PROCESSED_EVENT = 'discount_processed';
export const DISCOUNT_PROCESSING_EVENT = 'discount_processing';
