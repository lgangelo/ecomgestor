import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ReturnsController } from './returns.controller';
import { OrderReturnsController } from './order-returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [AuditModule, InventoryModule],
  controllers: [ReturnsController, OrderReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
