import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    // If error or no user, just return null (guest) instead of throwing
    if (err || !user) {
      return null;
    }
    return user;
  }
}
