import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
