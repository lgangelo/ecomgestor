import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelType, Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { UpsertCategoryFiscalProfileDto } from './dto/upsert-category-fiscal-profile.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: QueryCategoryDto) {
    const where: Prisma.CategoryWhereInput = {
      companyId,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const categories = await this.prisma.client.category.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      productCount: category._count.products,
    }));
  }

  async findByIdOrThrow(id: string, companyId: string) {
    const category = await this.prisma.client.category.findFirst({
      where: { id, companyId },
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }
    return category;
  }

  private async assertParentBelongsToCompany(parentId: string, companyId: string) {
    const parent = await this.prisma.client.category.findFirst({
      where: { id: parentId, companyId },
    });
    if (!parent) {
      throw new NotFoundException('Categoria pai não encontrada');
    }
  }

  async create(companyId: string, dto: CreateCategoryDto) {
    if (dto.parentId) {
      await this.assertParentBelongsToCompany(dto.parentId, companyId);
    }

    try {
      return await this.prisma.client.category.create({
        data: {
          companyId,
          name: dto.name,
          parentId: dto.parentId ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe uma categoria com esse nome');
      }
      throw error;
    }
  }

  async update(id: string, companyId: string, dto: UpdateCategoryDto) {
    const existing = await this.findByIdOrThrow(id, companyId);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new ConflictException('Uma categoria não pode ser pai de si mesma');
      }
      await this.assertParentBelongsToCompany(dto.parentId, companyId);
    }

    try {
      const updated = await this.prisma.client.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        },
      });
      return { old: existing, updated };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe uma categoria com esse nome');
      }
      throw error;
    }
  }

  /** Nunca exclui silenciosamente uma categoria com produtos ou subcategorias vinculadas — o
   * operador precisa mover/desvincular esses itens primeiro (sem exclusão em cascata). */
  async remove(id: string, companyId: string) {
    const category = await this.findByIdOrThrow(id, companyId);

    const [childCount, productCount] = await Promise.all([
      this.prisma.client.category.count({ where: { parentId: id } }),
      this.prisma.client.product.count({ where: { categoryId: id } }),
    ]);

    if (childCount > 0) {
      throw new ConflictException(
        `Não é possível excluir: existem ${childCount} categoria(s) filha(s) vinculada(s). Mova-as ou exclua-as primeiro.`,
      );
    }
    if (productCount > 0) {
      throw new ConflictException(
        `Não é possível excluir: ${productCount} produto(s) estão vinculados a esta categoria. Mova-os para outra categoria primeiro.`,
      );
    }

    await this.prisma.client.category.delete({ where: { id } });
    return category;
  }

  async findFiscalProfiles(categoryId: string, companyId: string) {
    await this.findByIdOrThrow(categoryId, companyId);
    return this.prisma.client.categoryFiscalProfile.findMany({
      where: { categoryId },
      orderBy: { channelType: 'asc' },
    });
  }

  async upsertFiscalProfile(categoryId: string, companyId: string, dto: UpsertCategoryFiscalProfileDto) {
    await this.findByIdOrThrow(categoryId, companyId);

    const { channelType, ...data } = dto;
    return this.prisma.client.categoryFiscalProfile.upsert({
      where: { categoryId_channelType: { categoryId, channelType } },
      create: { companyId, categoryId, channelType, ...data },
      update: data,
    });
  }

  async removeFiscalProfile(categoryId: string, companyId: string, channelType: ChannelType) {
    await this.findByIdOrThrow(categoryId, companyId);
    const existing = await this.prisma.client.categoryFiscalProfile.findUnique({
      where: { categoryId_channelType: { categoryId, channelType } },
    });
    if (!existing) throw new NotFoundException('Dados fiscais não encontrados para esta categoria/plataforma');
    await this.prisma.client.categoryFiscalProfile.delete({ where: { id: existing.id } });
    return existing;
  }
}
