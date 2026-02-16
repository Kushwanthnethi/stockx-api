import { Module } from '@nestjs/common';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StocksModule } from './stocks/stocks.module';
import { PostsModule } from './posts/posts.module';
import { InvestorsModule } from './investors/investors.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';

import { CronModule } from './cron/cron.module';
import { NewsBotModule } from './news-bot/news-bot.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { StrategistModule } from './strategist/strategist.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    PrismaModule,
    StocksModule,
    PostsModule,
    NotificationsModule,
    InvestorsModule,
    AdminModule,
    CronModule,
    NewsBotModule,
    PortfoliosModule,
    StrategistModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
