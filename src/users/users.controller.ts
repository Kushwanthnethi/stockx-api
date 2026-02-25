import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // This seems correct if auth is sibling to users

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  create(@Body() createUserDto: any) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me')
  async updateMe(
    @Request() req: any,
    @Body()
    body: {
      firstName?: string;
      lastName?: string;
      bio?: string;
      avatarUrl?: string;
    },
  ) {
    return this.usersService.updateProfile(req.user.id, body);
  }

  @Get('profile/:handle')
  async getProfile(@Param('handle') handle: string) {
    const user = await this.usersService.findByHandle(handle);
    if (!user) return null;
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/follow')
  async followUser(@Request() req: any, @Param('id') id: string) {
    return this.usersService.followUser(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/block')
  async blockUser(@Request() req: any, @Param('id') id: string) {
    return this.usersService.blockUser(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/unfollow')
  async unfollowUser(@Request() req: any, @Param('id') id: string) {
    return this.usersService.unfollowUser(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/is-following')
  async isFollowing(@Request() req: any, @Param('id') id: string) {
    const isFollowing = await this.usersService.isFollowing(req.user.id, id);
    return { isFollowing };
  }

  @Get(':id/followers')
  async getFollowers(@Param('id') id: string) {
    return this.usersService.getFollowers(id);
  }

  @Get(':id/following')
  async getFollowing(@Param('id') id: string) {
    return this.usersService.getFollowing(id);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('record-visit')
  async recordVisit(@Request() req: any) {
    return this.usersService.recordVisit(req.user.id);
  }

  @Get(':id/visits')
  async getVisits(@Param('id') id: string) {
    return this.usersService.getUserVisits(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/preferences')
  async updatePreferences(
    @Request() req: any,
    @Body() body: { receiveReport?: boolean },
  ) {
    return this.usersService.updatePreferences(req.user.id, body);
  }
}
