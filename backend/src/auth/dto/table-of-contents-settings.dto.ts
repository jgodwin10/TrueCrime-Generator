import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { TocSettings } from '../../content/table-of-contents';

// Heading and entry take an option number or your own text, so their type is
// checked when the settings are normalized; unknown or invalid values drop
export class TableOfContentsSettingsDto implements TocSettings {
  @ApiProperty({
    example: 1,
    description: 'Option number, or your own heading text',
    required: false,
  })
  @IsOptional()
  heading?: number | string;

  @ApiProperty({
    example: 'Part {n} · {title}',
    description:
      'Option number, or your own pattern with {title} (and optionally {n}, {word}, {ordinal}, {roman})',
    required: false,
  })
  @IsOptional()
  entry?: number | string;

  @ApiProperty({
    example: 1,
    description: '0 = chapters only, 1 = with sections, 2 = with subsections',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  detail?: number;
}
