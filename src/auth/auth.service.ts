import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) { }

  async validateUser(email: string, pass?: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && user.passwordHash) {
      if (pass) {
        const isMatch = await bcrypt.compare(pass, user.passwordHash);
        if (isMatch) {
          const { passwordHash, ...result } = user;
          return result;
        }
      } else {
        const { passwordHash, ...result } = user;
        return result;
      }
    }
    return null;
  }

  async register(data: any) {
    const existing = await this.usersService.findByEmail(data.email);
    if (existing) {
      throw new Error('User already exists');
    }
    return this.usersService.create(data);
  }

  async login(user: any) {
    // Record visit for Active Users stats
    await this.usersService.recordVisit(user.id);

    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: user,
    };
  }

  async googleLogin(req: any) {
    if (!req.user) {
      return 'No user from google';
    }

    let user = await this.usersService.findByEmail(req.user.email);
    if (!user) {
      console.log('User not found, creating new user for:', req.user.email);
      user = await this.usersService.create({
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        picture: req.user.picture,
      });
    }

    return this.login(user);
  }

  async googleOneTapLogin(credential: string) {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('Invalid Google token');
      }

      let user = await this.usersService.findByEmail(payload.email);
      if (!user) {
        user = await this.usersService.create({
          email: payload.email,
          firstName: payload.given_name || '',
          lastName: payload.family_name || '',
          picture: payload.picture || '',
        });
      }

      return this.login(user);
    } catch (error) {
      console.error('Google One Tap verification failed:', error);
      throw new UnauthorizedException('Invalid Google credential');
    }
  }
}
