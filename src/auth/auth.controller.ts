import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { Public } from './public.decorator';
import { OtpService } from './otp.service';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly usersService: UsersService,
  ) { }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req: any) {
    // Guard redirects
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: any, @Res() res: any) {
    const data: any = await this.authService.googleLogin(req);
    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(
      `${frontendUrl}/auth/callback?token=${data.access_token}`,
    );
  }
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: any) {
    // req.user from JwtStrategy is { userId: ... }
    return this.authService.validateUser(req.user.email);
  }

  @Post('login')
  @Public()
  async login(@Body() body: { email: string; password?: string }) {
    if (!body.password) {
      throw new UnauthorizedException('Password is required');
    }
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }

  @Post('send-otp')
  @Public()
  async sendOtp(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException('Email is required');
    }
    const existingUser = await this.usersService.findByEmail(body.email);
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }
    await this.otpService.generateAndSendOtp(body.email);
    return { success: true, message: 'OTP sent successfully' };
  }

  @Post('register')
  @Public()
  async register(@Body() body: any) {
    if (!body.email || !body.otp || !body.firstName || body.lastName === undefined || !body.password) {
      throw new BadRequestException('All fields (email, otp, firstName, lastName, password) are required');
    }

    const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!PASSWORD_REGEX.test(body.password)) {
      throw new BadRequestException('Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special character');
    }

    const isOtpValid = await this.otpService.verifyOtp(body.email, body.otp);
    if (!isOtpValid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Body should be { email, password, firstName, lastName }
    return this.authService.register(body);
  }

  @Post('forgot-password/send-otp')
  @Public()
  async forgotPasswordSendOtp(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException('Email is required');
    }
    const existingUser = await this.usersService.findByEmail(body.email);
    if (!existingUser) {
      // Return a generic success message to prevent email enumeration
      return { success: true, message: 'If an account with that email exists, an OTP has been sent.' };
    }
    await this.otpService.generateAndSendOtp(body.email, 'reset');
    return { success: true, message: 'If an account with that email exists, an OTP has been sent.' };
  }

  @Post('forgot-password/reset')
  @Public()
  async forgotPasswordReset(@Body() body: any) {
    if (!body.email || !body.otp || !body.password) {
      throw new BadRequestException('All fields (email, otp, new password) are required');
    }

    const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!PASSWORD_REGEX.test(body.password)) {
      throw new BadRequestException('Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special character');
    }

    const isOtpValid = await this.otpService.verifyOtp(body.email, body.otp);
    if (!isOtpValid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const existingUser = await this.usersService.findByEmail(body.email);
    if (!existingUser) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.usersService.updatePassword(body.email, body.password);
    return { success: true, message: 'Password updated successfully' };
  }
}
