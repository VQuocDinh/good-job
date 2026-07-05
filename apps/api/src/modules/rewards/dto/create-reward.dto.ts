import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreateRewardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsInt()
  @Min(1)
  cost!: number;
}
