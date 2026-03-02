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
  await app.listen(port);
}

// Global process error handlers to prevent crashing on unhandled WS connection failures
process.on('uncaughtException', (err: any) => {
  if (err?.message && err.message.includes('Unexpected server response: 502')) {
    console.error('⚠️ [Global] Caught Fyers WebSocket 502 Error. Preventing app crash.');
    return;
  }
  console.error('🚨 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  if (reason?.message && reason.message.includes('Unexpected server response: 502')) {
    console.error('⚠️ [Global] Caught Fyers WebSocket 502 Rejection. Preventing app crash.');
    return;
  }
  console.error('🚨 UNHANDLED REJECTION:', reason);
});

bootstrap();
