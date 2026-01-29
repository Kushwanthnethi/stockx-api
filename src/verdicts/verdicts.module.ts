import { Module } from '@nestjs/common';
import { VerdictsService } from './verdicts.service';
import { VerdictsController } from './verdicts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StocksModule } from '../stocks/stocks.module';

@Module({
    imports: [PrismaModule, StocksModule],
    controllers: [VerdictsController],
    providers: [VerdictsService],
    exports: [VerdictsService]
})
export class VerdictsModule { }
