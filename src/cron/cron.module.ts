import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { StocksModule } from '../stocks/stocks.module';
import { EarningsScheduler } from './earnings-scheduler';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        StocksModule
    ],
    providers: [EarningsScheduler],
})
export class CronModule { }
