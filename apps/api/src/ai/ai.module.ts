import { Module } from '@nestjs/common';
import { AiCopyService } from './ai-copy.service';
import { AiController } from './ai.controller';

@Module({
  controllers: [AiController],
  providers: [AiCopyService],
  exports: [AiCopyService],
})
export class AiModule {}
