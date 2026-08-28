import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReturnsController } from './returns.controller';
import { OrderReturnsController } from './order-returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [AuditModule],
  controllers: [ReturnsController, OrderReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
