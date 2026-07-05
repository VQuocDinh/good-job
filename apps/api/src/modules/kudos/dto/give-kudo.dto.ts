import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GiveKudoDto {
  @IsUUID()
  receiverId!: string;

  @IsInt()
  @Min(10)
  @Max(50)
  points!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  coreValue!: string;
}
