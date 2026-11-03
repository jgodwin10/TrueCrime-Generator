import {
  Controller,
  Post,
  Body,
  Param,
  Get,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GenerateTrueCrimeDto } from './dto/generate-true-crime.dto';
import { ContentService } from './content.service';

@ApiTags('content')
@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post('generate-true-crime/:projectId')
  @ApiOperation({
    summary: 'Generate a complete English true crime book',
    description: `Generates a narrative true crime book following this 5-step process:

Step 1: Create a chronological 12-chapter outline of the case
Step 2: Write the Introduction around one documented, non-violent moment
Step 3: Write each case chapter in order, as narrative prose
Step 4: Write the Conclusion on where the case stands, with a case timeline
Step 5: Add copyright, about-the-book and table of contents

Prompts forbid invented quotes, dialogue and private thoughts, copied storytelling, naming anyone as guilty without a conviction, and graphic detail. Author notes override the model's memory of the facts, but not those rules.`,
  })
  @ApiResponse({
    status: 201,
    description: 'Book generation started. Returns job ID for tracking.',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async generateTrueCrime(
    @Param('projectId') projectId: string,
    @Body() generateDto: GenerateTrueCrimeDto,
  ) {
    return await this.contentService.generateTrueCrimeBook(projectId, generateDto);
  }

  @Get('status/:jobId')
  @ApiOperation({ summary: 'Get book generation job status and progress' })
  @ApiResponse({ 
    status: 200, 
    description: 'Job status with progress percentage (0-100)' 
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getStatus(@Param('jobId') jobId: string) {
    return await this.contentService.getGenerationStatus(jobId);
  }
}