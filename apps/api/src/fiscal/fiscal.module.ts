import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';
import { ManualFiscalProvider } from './manual-fiscal-provider.service';

@Module({
  imports: [AuditModule],
  controllers: [FiscalController],
  providers: [FiscalService, ManualFiscalProvider],
  exports: [FiscalService],
})
export class FiscalModule {}
