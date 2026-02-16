import { Module } from '@nestjs/common';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [PortfoliosController],
    providers: [PortfoliosService],
    exports: [PortfoliosService]
})
export class PortfoliosModule { }
