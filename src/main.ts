import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('Starting NestJS application...');
  const app = await NestFactory.create(AppModule);
  console.log('NestJS application instance created.');

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
  console.log(`Listening on port ${port}...`);
  await app.listen(port);
  console.log('Application is successfully listening on the port.');
}
bootstrap();
