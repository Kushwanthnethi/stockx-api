import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortfoliosService } from './portfolios.service';
import { SyncPortfolioDto, AddHoldingDto, UpdateHoldingDto } from './dto';

@Controller('portfolios')
@UseGuards(JwtAuthGuard)
export class PortfoliosController {
    constructor(private readonly portfoliosService: PortfoliosService) { }

    @Get('me')
    async getMyPortfolio(@Request() req: any) {
        return this.portfoliosService.getUserPortfolio(req.user.id);
    }

    // ─── Holdings CRUD ──────────────────────────────────────────────

    @Get('holdings')
    async getHoldings(@Request() req: any) {
        return this.portfoliosService.getHoldings(req.user.id);
    }

    @Post('holdings')
    async addHolding(@Request() req: any, @Body() dto: AddHoldingDto) {
        return this.portfoliosService.addHolding(req.user.id, dto);
    }

    @Patch('holdings/:symbol')
    async updateHolding(
        @Request() req: any,
        @Param('symbol') symbol: string,
        @Body() dto: UpdateHoldingDto,
    ) {
        return this.portfoliosService.updateHolding(req.user.id, symbol, dto);
    }

    @Delete('holdings/:symbol')
    async removeHolding(@Request() req: any, @Param('symbol') symbol: string) {
        return this.portfoliosService.removeHolding(req.user.id, symbol);
    }

    // ─── AI Health Score ────────────────────────────────────────────

    @Post('analyze')
    async analyzePortfolio(@Request() req: any) {
        return this.portfoliosService.analyzePortfolio(req.user.id);
    }

    // ─── Legacy ─────────────────────────────────────────────────────

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
