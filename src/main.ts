import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://stockx-web.vercel.app',
      'https://www.stocksx.info',
      'https://stocksx.info',
      (process.env.FRONTEND_URL || ''),
    ].filter(Boolean),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3333, '0.0.0.0');
}
bootstrap();
