import { IsString, IsOptional, IsArray, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateTrueCrimeDto {
  @ApiProperty({ example: 'The Lindbergh Kidnapping: A Case Reexamined' })
  @IsString()
  title: string;

  @ApiProperty({
    example: 'The 1932 Crime, the Trial and the Questions That Remain',
    required: false,
  })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiProperty({ example: 'John Smith' })
  @IsString()
  author: string;

  @ApiProperty({
    example: 'The Lindbergh kidnapping (1932)',
    description: 'The case the book covers, by the name it is generally known by',
  })
  @IsString()
  subject: string;

  @ApiProperty({
    example: 'Focus on the ransom investigation and the trial evidence.',
    description:
      'Optional facts or direction from the author. They override the writer\'s memory of the facts, but cannot make anyone guilty without a conviction.',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ example: 12, default: 12, minimum: 5, maximum: 30 })
  @IsInt()
  @Min(5)
  @Max(30)
  @IsOptional()
  numberOfChapters?: number = 12;
}

export class BookOutlineDto {
  @ApiProperty()
  title: string;

  @ApiProperty()
  subtitle?: string;

  @ApiProperty()
  author: string;

  @ApiProperty({ type: [Object] })
  chapters: ChapterOutline[];
}

export class ChapterOutline {
  chapterNumber: number;
  chapterTitle: string;
  sections: SectionOutline[];
}

export class SectionOutline {
  sectionTitle: string;
  subsections: string[];
}