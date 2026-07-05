import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** A comment needs text and/or media (the service enforces at-least-one). */
export class CreateCommentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  mediaUrl?: string;
}
