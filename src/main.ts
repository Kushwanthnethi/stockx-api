import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://stockx-web.vercel.app',
      'https://www.stocksx.info',
      'https://stocksx.info',
      process.env.FRONTEND_URL || '',
    ].filter(Boolean),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = process.env.PORT || 3333;
  console.log(`\n\n🚀 HTTP/WebSocket Server listening on port ${port}!\n\n`);
  await app.listen(port);
}

// Global process error handlers to prevent crashing on unhandled WS connection failures
process.on('uncaughtException', (err: any) => {
  if (err?.message && (err.message.includes('502') || err.message.includes('503'))) {
    console.error(`⚠️ [Global] Caught WebSocket ${err.message.includes('502') ? '502' : '503'} Error. Preventing app crash.`);
    return;
  }
  console.error('🚨 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  if (reason?.message && (reason.message.includes('502') || reason.message.includes('503'))) {
    console.error(`⚠️ [Global] Caught WebSocket ${reason.message.includes('502') ? '502' : '503'} Rejection. Preventing app crash.`);
    return;
  }
  console.error('🚨 UNHANDLED REJECTION:', reason);
});

bootstrap();
