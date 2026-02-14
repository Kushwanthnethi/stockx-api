import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  UseInterceptors,
  UploadedFile,
  Param,
  Delete,
  Patch,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) { }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Req() req: any, @Body() createPostDto: CreatePostDto) {
    return this.postsService.create(req.user.id, createPostDto);
  }

  @Post('upload')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    try {
      if (!file) {
        throw new Error('No file uploaded');
      }

      console.log('Starting Cloudinary upload for file:', file.originalname);

      // Cloudinary Upload Logic
      const { v2: cloudinary } = require('cloudinary');

      // Ensure config is loaded (it should be via provider, but for safety in controller we can rely on env or provider)
      // Since we didn't inject the provider here, we can rely on global config if set, OTHERwise we configure it here lazily or assume it's set.
      // Better approach: Configure it in the method using env vars directly ensures it works even if module init had issues, 
      // but best practice is to use the provider. For now, let's configure it explicitly to be safe.

      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });

      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'stockx-uploads' },
          (error: any, result: any) => {
            if (error) return reject(error);
            resolve(result);
          }
        );

        // Write buffer to stream
        const Readable = require('stream').Readable;
        const stream = new Readable();
        stream.push(file.buffer);
        stream.push(null);
        stream.pipe(uploadStream);
      });

      // @ts-ignore
      const publicUrl = uploadResult.secure_url;
      console.log('Upload successful, URL:', publicUrl);

      return {
        url: publicUrl,
      };
    } catch (error) {
      console.error('CRITICAL UPLOAD ERROR:', error);
      throw new HttpException(
        'Image upload failed: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    // req.user will be populated if token is valid, else null
    return this.postsService.findAll(req.user?.id, Number(page), Number(limit));
  }

  @Get('symbol/:symbol')
  findBySymbol(@Param('symbol') symbol: string, @Req() req: any) {
    return this.postsService.findBySymbol(symbol, req.user?.id);
  }

  @Post(':id/like')
  @UseGuards(AuthGuard('jwt'))
  toggleLike(@Req() req: any, @Param('id') id: string) {
    return this.postsService.toggleLike(req.user.id, id);
  }

  @Post(':id/comments')
  @UseGuards(AuthGuard('jwt'))
  createComment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() createCommentDto: { content: string },
  ) {
    // Using inline DTO for simplicity or import CreateCommentDto
    return this.postsService.createComment(
      req.user.id,
      id,
      createCommentDto.content,
    );
  }

  @Get(':id/comments')
  getComments(@Param('id') id: string) {
    return this.postsService.getComments(id);
  }

  @Post(':id/share')
  sharePost(@Param('id') id: string) {
    return this.postsService.sharePost(id);
  }

  @Post(':id/reshare')
  @UseGuards(AuthGuard('jwt'))
  resharePost(@Req() req: any, @Param('id') id: string) {
    return this.postsService.resharePost(req.user.id, id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  delete(@Req() req: any, @Param('id') id: string) {
    return this.postsService.delete(req.user.id, id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body('content') content: string,
  ) {
    return this.postsService.update(req.user.id, id, content);
  }

  @Post(':id/report')
  @UseGuards(AuthGuard('jwt'))
  report(@Req() req: any, @Param('id') id: string) {
    return this.postsService.reportPost(req.user.id, id);
  }

  @Post(':id/bookmark')
  @UseGuards(AuthGuard('jwt'))
  toggleBookmark(@Req() req: any, @Param('id') id: string) {
    return this.postsService.toggleBookmark(req.user.id, id);
  }

  @Get('user/bookmarks')
  @UseGuards(AuthGuard('jwt'))
  getBookmarks(@Req() req: any) {
    return this.postsService.getBookmarks(req.user.id);
  }
}
