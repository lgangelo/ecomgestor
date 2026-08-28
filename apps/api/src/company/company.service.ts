import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrThrow(companyId: string) {
    const company = await this.prisma.client.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }
    return company;
  }

  async update(companyId: string, dto: UpdateCompanyDto) {
    const existing = await this.findOrThrow(companyId);

    const updated = await this.prisma.client.company.update({
      where: { id: companyId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.legalName !== undefined ? { legalName: dto.legalName } : {}),
        ...(dto.cnpj !== undefined ? { cnpj: dto.cnpj } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      },
    });

    return { old: existing, updated };
  }
}
