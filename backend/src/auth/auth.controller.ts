// src/modules/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Put,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UserService } from './user.service';
import { CopyrightSettingsDto } from './dto/copyright-settings.dto';
import { TableOfContentsSettingsDto } from './dto/table-of-contents-settings.dto';
import { FontSettingsDto } from './dto/font-settings.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.create(createUserDto);

    // Auto-login after registration
    const loginResult = await this.authService.login({
      email: createUserDto.email,
      password: createUserDto.password,
    });

    return {
      message: 'Registration successful',
      ...loginResult,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    return {
      message: 'Login successful',
      ...(await this.authService.login(loginDto)),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout() {
    return await this.authService.logout();
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Request() req) {
    return req.user;
  }

  @Get('copyright')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "Get this account's copyright page settings" })
  async getCopyright(@Request() req) {
    return this.userService.getCopyright(req.user.id);
  }

  @Post('copyright/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Render unsaved copyright settings' })
  async previewCopyright(
    @Request() req,
    @Body() settings: CopyrightSettingsDto,
  ) {
    return this.userService.previewCopyright(req.user.id, settings);
  }

  @Put('copyright')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Update this account's copyright page (applies to new books)",
  })
  async updateCopyright(
    @Request() req,
    @Body() settings: CopyrightSettingsDto,
  ) {
    return this.userService.updateCopyright(req.user.id, settings);
  }

  @Get('table-of-contents')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "Get this account's table of contents format" })
  async getTableOfContents(@Request() req) {
    return this.userService.getTableOfContents(req.user.id);
  }

  @Post('table-of-contents/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Render an unsaved table of contents format' })
  async previewTableOfContents(
    @Request() req,
    @Body() settings: TableOfContentsSettingsDto,
  ) {
    return this.userService.previewTableOfContents(req.user.id, settings);
  }

  @Put('table-of-contents')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Update this account's table of contents format (applies to new books)",
  })
  async updateTableOfContents(
    @Request() req,
    @Body() settings: TableOfContentsSettingsDto,
  ) {
    return this.userService.updateTableOfContents(req.user.id, settings);
  }

  @Get('fonts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "Get this account's heading and body fonts" })
  async getFonts(@Request() req) {
    return this.userService.getFonts(req.user.id);
  }

  @Put('fonts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Update this account's heading and body fonts (applies to new books)",
  })
  async updateFonts(@Request() req, @Body() settings: FontSettingsDto) {
    return this.userService.updateFonts(req.user.id, settings);
  }
}
