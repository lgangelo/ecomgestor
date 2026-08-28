import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockEntriesController } from './stock-entries.controller';
import { StockEntriesService } from './stock-entries.service';

@Module({
  imports: [AuditModule],
  controllers: [InventoryController, StockEntriesController],
  providers: [InventoryService, StockEntriesService],
  exports: [InventoryService],
})
export class InventoryModule {}
