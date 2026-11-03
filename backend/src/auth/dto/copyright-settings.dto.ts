import {
  IsString,
  IsOptional,
  IsEmail,
  IsObject,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { COPYRIGHT_LIMITS } from '../../content/copyright';
import type {
  CopyrightSettings,
  CopyrightWording,
} from '../../content/copyright';

// Blank strings clear a field, so only validate formats when there's a value
const hasValue = (_: unknown, value: unknown) =>
  typeof value === 'string' && value.trim().length > 0;

export class CopyrightSettingsDto implements CopyrightSettings {
  @ApiProperty({ example: 'Northgate Press LLC', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(COPYRIGHT_LIMITS.holder)
  holder?: string;

  @ApiProperty({ example: 'Northgate Press', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(COPYRIGHT_LIMITS.publisher)
  publisher?: string;

  @ApiProperty({ example: 'rights@northgatepress.com', required: false })
  @IsOptional()
  @ValidateIf(hasValue)
  @IsEmail()
  @MaxLength(COPYRIGHT_LIMITS.contactEmail)
  contactEmail?: string;

  @ApiProperty({ example: 'northgatepress.com', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(COPYRIGHT_LIMITS.website)
  website?: string;

  @ApiProperty({ example: 'First Digital Edition', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(COPYRIGHT_LIMITS.edition)
  edition?: string;

  @ApiProperty({
    example: 'Cover design by Studio North.',
    description: 'Extra paragraph added after the standard notices',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(COPYRIGHT_LIMITS.customNotice)
  customNotice?: string;

  @ApiProperty({
    example: { rights: 2, independence: 'Not authorized by anyone involved in {subject}.' },
    description:
      'Per section: an option number, or your own text (may use {subject}, {year}, {holder}, {publisher}, {contact}). Unknown sections and out-of-range numbers are ignored.',
    required: false,
  })
  @IsObject()
  @IsOptional()
  wording?: CopyrightWording;
}
