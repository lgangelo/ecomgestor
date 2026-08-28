import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import archiver from 'archiver';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { FiscalService } from './fiscal.service';
import { ListFiscalDocumentsQueryDto } from './dto/list-fiscal-documents-query.dto';
import { ExportFiscalDocumentsDto } from './dto/export-fiscal-documents.dto';

@Controller('fiscal')
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @Get('documents')
  @RequirePermissions(PERMISSIONS.FISCAL_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListFiscalDocumentsQueryDto) {
    return this.fiscalService.findAll(user.companyId, query);
  }

  @Get('documents/:id')
  @RequirePermissions(PERMISSIONS.FISCAL_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fiscalService.findOne(id, user.companyId);
  }

  @Get('documents/:id/xml')
  @RequirePermissions(PERMISSIONS.FISCAL_EXPORT)
  async downloadXml(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const doc = await this.fiscalService.findOne(id, user.companyId);
    const xml = this.fiscalService.buildXml(doc);
    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="nfe-${doc.number ?? doc.id}.xml"`,
    });
    res.send(xml);
  }

  @Post('documents/export')
  @RequirePermissions(PERMISSIONS.FISCAL_EXPORT)
  async exportXmls(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ExportFiscalDocumentsDto,
    @Res() res: Response,
  ) {
    const docs = await this.fiscalService.findManyByIds(dto.ids, user.companyId);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="documentos-fiscais.zip"',
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      res.status(500);
      res.end(String(err));
    });
    archive.pipe(res);

    for (const doc of docs) {
      const xml = this.fiscalService.buildXml(doc);
      archive.append(xml, { name: `nfe-${doc.number ?? doc.id}.xml` });
    }

    await archive.finalize();
  }
}
