import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockEntriesController } from './stock-entries.controller';
import { StockEntriesService } from './stock-entries.service';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryCountService } from './inventory-count.service';
import { InventoryLedgerService } from './ledger.service';

@Module({
  imports: [AuditModule],
  controllers: [InventoryController, StockEntriesController, InventoryCountController],
  providers: [InventoryService, StockEntriesService, InventoryCountService, InventoryLedgerService],
  exports: [InventoryService, InventoryLedgerService],
})
export class InventoryModule {}
