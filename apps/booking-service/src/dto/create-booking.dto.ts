import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class CreateBookingServiceItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsEnum(['Male', 'Female', 'Other'], {
    message: 'Gender must be Male, Female, or Other',
  })
  gender: string;

  @IsDateString()
  dob: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one service must be selected' })
  @ValidateNested({ each: true })
  @Type(() => CreateBookingServiceItemDto)
  services: CreateBookingServiceItemDto[];
}
