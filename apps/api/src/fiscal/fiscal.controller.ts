import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import archiver from 'archiver';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { buildCsvRow } from '../common/csv.util';
import { FiscalExportRow, FiscalService, UploadedFile as FiscalUploadedFile } from './fiscal.service';
import { ListFiscalDocumentsQueryDto } from './dto/list-fiscal-documents-query.dto';
import { ExportFiscalDocumentsDto } from './dto/export-fiscal-documents.dto';
import { UploadFiscalDocumentDto } from './dto/upload-fiscal-document.dto';
import { AssociateFiscalDocumentDto } from './dto/associate-fiscal-document.dto';
import { MonthlyFiscalQueryDto } from './dto/monthly-fiscal-query.dto';

const MANIFEST_HEADER = ['pedido', 'canal', 'tipo', 'numero', 'serie', 'chave', 'data_emissao', 'valor', 'arquivo', 'status_download'];
const PENDENCIAS_HEADER = ['pedido', 'tipo', 'numero', 'chave', 'data_emissao', 'motivo'];

@Controller('fiscal')
export class FiscalController {
  constructor(
    private readonly fiscalService: FiscalService,
    private readonly auditService: AuditService,
  ) {}

  @Get('documents')
  @RequirePermissions(PERMISSIONS.FISCAL_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListFiscalDocumentsQueryDto) {
    return this.fiscalService.findAll(user.companyId, query);
  }

  @Get('pending')
  @RequirePermissions(PERMISSIONS.FISCAL_READ)
  getPending(@CurrentUser() user: AuthenticatedUser) {
    return this.fiscalService.getPending(user.companyId);
  }

  @Get('monthly-summary')
  @RequirePermissions(PERMISSIONS.FISCAL_READ)
  getMonthlySummary(@CurrentUser() user: AuthenticatedUser, @Query() query: MonthlyFiscalQueryDto) {
    return this.fiscalService.getMonthlySummary(user.companyId, query.referenceMonth, query.channelId);
  }

  @Get('documents/:id')
  @RequirePermissions(PERMISSIONS.FISCAL_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fiscalService.findOne(id, user.companyId);
  }

  @Post('documents/upload')
  @RequirePermissions(PERMISSIONS.FISCAL_EXPORT)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: FiscalUploadedFile,
    @Body() dto: UploadFiscalDocumentDto,
  ) {
    const { document, autoAssociated } = await this.fiscalService.uploadDocument(
      user.companyId,
      user.userId,
      file,
      dto,
    );
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'fiscal_document',
      entityId: document.id,
      newValue: { number: document.number, orderId: document.orderId, returnId: document.returnId, autoAssociated },
    });
    return { ...document, autoAssociated };
  }

  @Patch('documents/:id/associate')
  @RequirePermissions(PERMISSIONS.FISCAL_EXPORT)
  async associate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssociateFiscalDocumentDto,
  ) {
    const updated = await this.fiscalService.associate(id, user.companyId, dto);
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'fiscal_document',
      entityId: id,
      newValue: { orderId: dto.orderId ?? null, returnId: dto.returnId ?? null },
    });
    return updated;
  }

  @Get('documents/:id/xml')
  @RequirePermissions(PERMISSIONS.FISCAL_EXPORT)
  async downloadXml(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const doc = await this.fiscalService.findOne(id, user.companyId);
    const buffer = await this.fiscalService.tryDownloadXml(doc);
    if (!buffer) {
      throw new NotFoundException(
        'XML indisponível para este documento — ele existe apenas como referência fiscal (seção 2 da Fase 4), sem cópia recuperável nesta instalação.',
      );
    }
    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="nfe-${doc.number ?? doc.id}.xml"`,
    });
    res.send(buffer);
  }

  /** Exportação manual por seleção de IDs (fluxo legado — a ação principal agora é por mês). */
  @Post('documents/export')
  @RequirePermissions(PERMISSIONS.FISCAL_EXPORT)
  async exportXmls(@CurrentUser() user: AuthenticatedUser, @Body() dto: ExportFiscalDocumentsDto, @Res() res: Response) {
    const docs = await this.fiscalService.findManyByIds(dto.ids, user.companyId);
    await this.streamPackage(docs, 'documentos-fiscais', res);
  }

  /** Ação principal da Fase 4 (seção 9-11): "Baixar XMLs para contabilidade". */
  @Get('monthly-export')
  @RequirePermissions(PERMISSIONS.FISCAL_EXPORT)
  async exportMonthly(@CurrentUser() user: AuthenticatedUser, @Query() query: MonthlyFiscalQueryDto, @Res() res: Response) {
    const docs = await this.fiscalService.getDocumentsForMonth(user.companyId, query.referenceMonth, query.channelId);
    if (docs.length === 0) {
      throw new BadRequestException('Nenhum documento fiscal encontrado para o período selecionado.');
    }
    await this.auditService.log({
      companyId: user.companyId,
      userId: user.userId,
      action: 'FISCAL_MONTHLY_EXPORT',
      entity: 'fiscal_document',
      newValue: { referenceMonth: query.referenceMonth, channelId: query.channelId ?? null, documentsCount: docs.length },
    });
    await this.streamPackage(docs, `fiscal-${query.referenceMonth}`, res);
  }

  /**
   * ZIP em memória (seção 10): cada XML é lido do provider e anexado direto ao stream do
   * archiver — nenhum arquivo temporário é escrito em disco, então não há nome previsível,
   * path traversal ou limpeza de temporários a fazer aqui (o único caminho de arquivo que
   * existe, `xmlPath`, já é um nome interno gerado por hash, nunca um valor vindo do usuário).
   * Falha parcial nunca descarta os documentos válidos (seção 14) — os que não puderem ser
   * baixados viram uma linha em `pendencias.csv` (seção 15), nunca silenciosamente omitidos.
   */
  private async streamPackage(docs: FiscalExportRow[], filenameBase: string, res: Response): Promise<void> {
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filenameBase}.zip"`,
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      res.status(500);
      res.end(String(err));
    });
    archive.pipe(res);

    const manifestRows = [MANIFEST_HEADER.join(';')];
    const pendenciasRows = [PENDENCIAS_HEADER.join(';')];

    for (const doc of docs) {
      const buffer = await this.fiscalService.tryDownloadXml(doc);
      const folder = doc.type === 'RETURN_INVOICE' ? 'devolucoes' : doc.type === 'SALE_INVOICE' ? 'vendas' : 'outros';
      const filename = `${folder}/nfe-${doc.number ?? doc.id}.xml`;
      const issueDateStr = doc.issueDate ? doc.issueDate.toISOString() : '';

      if (buffer) {
        archive.append(buffer, { name: filename });
        manifestRows.push(
          buildCsvRow([doc.orderRef, doc.channelName, doc.type, doc.number, doc.series, doc.accessKey, issueDateStr, doc.amount, filename, 'OK']),
        );
      } else {
        pendenciasRows.push(
          buildCsvRow([doc.orderRef, doc.type, doc.number, doc.accessKey, issueDateStr, this.fiscalService.reasonUnavailable(doc)]),
        );
      }
    }

    archive.append(manifestRows.join('\n'), { name: 'manifest.csv' });
    if (pendenciasRows.length > 1) {
      archive.append(pendenciasRows.join('\n'), { name: 'pendencias.csv' });
    }

    await archive.finalize();
  }
}
