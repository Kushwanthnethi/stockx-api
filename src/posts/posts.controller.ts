import { Controller, Post, Body, UseGuards, Req, Get, UseInterceptors, UploadedFile, Param, Delete, Patch } from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { bucket } from '../config/firebase.config';

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
    @UseInterceptors(FileInterceptor('file', {
        storage: memoryStorage(), // Use memory storage for Firebase
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    }))
    async uploadFile(@UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new Error('No file uploaded');
        }

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const filename = `${uniqueSuffix}${extname(file.originalname)}`;
        const fileRef = bucket.file(`uploads/${filename}`);

        await fileRef.save(file.buffer, {
            contentType: file.mimetype,
            public: true, // Legacy method
            metadata: {
                firebaseStorageDownloadTokens: uniqueSuffix, // Helps with public access sometimes
            }
        });

        // Explicitly make public
        try {
            await fileRef.makePublic();
        } catch (e) {
            console.warn('Failed to make file public via makePublic(), checking bucket IAM might be needed', e);
        }

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileRef.name}`;

        return {
            url: publicUrl,
        };
    }

    @Get()
    @UseGuards(OptionalJwtAuthGuard)
    findAll(@Req() req: any) {
        // req.user will be populated if token is valid, else null
        return this.postsService.findAll(req.user?.id);
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
    createComment(@Req() req: any, @Param('id') id: string, @Body() createCommentDto: { content: string }) { // Using inline DTO for simplicity or import CreateCommentDto
        return this.postsService.createComment(req.user.id, id, createCommentDto.content);
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
    update(@Req() req: any, @Param('id') id: string, @Body('content') content: string) {
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
