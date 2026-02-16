import { Controller, Get, Post, Body, UseGuards, Request, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortfoliosService } from './portfolios.service';
import { SyncPortfolioDto } from './dto';

@Controller('portfolios')
@UseGuards(JwtAuthGuard)
export class PortfoliosController {
    constructor(private readonly portfoliosService: PortfoliosService) { }

    @Get('me')
    async getMyPortfolio(@Request() req: any) {
        return this.portfoliosService.getUserPortfolio(req.user.id);
    }

    @Post('sync')
    async syncMyPortfolio(@Request() req: any, @Body() dto: SyncPortfolioDto) {
        return this.portfoliosService.syncPortfolio(req.user.id, dto);
    }

    @Post('upload-pdf')
    @UseInterceptors(FileInterceptor('file'))
    async uploadPdf(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
        return this.portfoliosService.parsePortfolioFile(req.user.id, file.buffer, file.mimetype);
    }
}
