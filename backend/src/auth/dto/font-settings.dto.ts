import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { FontSettings } from '../../content/book-fonts';

// Fonts not offered for a role drop when the settings are normalized
export class FontSettingsDto implements FontSettings {
  @ApiProperty({ example: 'playfair-display', description: 'Heading font id', required: false })
  @IsOptional()
  @IsString()
  heading?: string;

  @ApiProperty({ example: 'lora', description: 'Body font id', required: false })
  @IsOptional()
  @IsString()
  body?: string;
}
