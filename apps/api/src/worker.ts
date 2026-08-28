import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.enableShutdownHooks();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', service: 'Worker', message: 'worker_started' }));
}

bootstrap();
