
import { Module } from '@nestjs/common';
import { InvestorsService } from './investors.service';
import { InvestorsController } from './investors.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [InvestorsController],
    providers: [InvestorsService],
})
export class InvestorsModule { }
