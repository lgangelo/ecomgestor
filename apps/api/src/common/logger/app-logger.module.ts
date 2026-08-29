import { Global, Module } from '@nestjs/common';
import { AppLoggerService } from './app-logger.service';

/**
 * `AppLoggerService` é usado por dezenas de serviços em módulos de feature diferentes (jobs
 * agendados, integração TikTok, filas, notificações) — em vez de importar isso em cada módulo
 * individualmente, o módulo é `@Global()`: registrado uma única vez aqui, disponível em toda a
 * aplicação. Sem isso, qualquer módulo fora do `AppModule` que injeta `AppLoggerService` falha
 * ao iniciar (erro de resolução de dependência do Nest).
 */
@Global()
@Module({
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class AppLoggerModule {}
