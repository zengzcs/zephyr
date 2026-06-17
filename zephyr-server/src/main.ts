import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://192.168.1.200:5011',
    credentials: true,
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Zephyr API')
    .setDescription('Zephyr API documentation')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'authorization',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 5010;
  const host = '0.0.0.0';
  await app.listen(port, host);
  console.log(`🚀 Server running on http://0.0.0.0:${port}`);
  console.log(`📖 API Docs: http://0.0.0.0:${port}/api/docs`);
}

bootstrap();
