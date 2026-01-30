import { ServiceItemDto } from '@app/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

@Entity()
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  userId: string;

  @Column({ type: 'text' })
  gender: string;

  @Column({ type: 'text' })
  dob: string;

  @Column({ type: 'jsonb' })
  services: ServiceItemDto[];

  @Column({ type: 'float' })
  basePrice: number;

  @Column({ type: 'float', nullable: true })
  finalPrice: number | null;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;

  @Column({ type: 'text', nullable: true })
  failReason: string | null;

  @Column({ type: 'jsonb', default: [] })
  history: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
