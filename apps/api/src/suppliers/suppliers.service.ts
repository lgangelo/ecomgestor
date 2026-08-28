import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string) {
    return this.prisma.client.supplier.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  create(companyId: string, dto: CreateSupplierDto) {
    return this.prisma.client.supplier.create({
      data: {
        companyId,
        name: dto.name,
        document: dto.document ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
      },
    });
  }
}
