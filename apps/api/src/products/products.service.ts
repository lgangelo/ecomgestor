import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateCostHistoryDto } from './dto/create-cost-history.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: QueryProductDto) {
    const where: Prisma.ProductWhereInput = {
      companyId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { baseSku: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.brand ? { brand: { equals: query.brand, mode: 'insensitive' as const } } : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.client.product.findMany({
        where,
        include: {
          category: { select: { name: true } },
          variants: {
            select: {
              suggestedPrice: true,
              inventory: { select: { available: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.product.count({ where }),
    ]);

    const items = products.map((product) => {
      const prices = product.variants.map((v) => Number(v.suggestedPrice));
      const totalAvailable = product.variants.reduce(
        (sum, v) => sum + (v.inventory?.available ?? 0),
        0,
      );
      return {
        id: product.id,
        name: product.name,
        baseSku: product.baseSku,
        brand: product.brand,
        status: product.status,
        categoryName: product.category?.name ?? null,
        imageUrl: product.imageUrl,
        variantCount: product.variants.length,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
        totalAvailable,
      };
    });

    return paginate(items, total, query.page, query.pageSize);
  }

  async findOne(id: string, companyId: string) {
    const product = await this.prisma.client.product.findFirst({
      where: { id, companyId },
      include: {
        category: { select: { id: true, name: true } },
        variants: {
          include: {
            costHistory: { orderBy: { effectiveDate: 'desc' }, take: 1 },
            inventory: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      brand: product.brand,
      status: product.status,
      baseSku: product.baseSku,
      imageUrl: product.imageUrl,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      category: product.category ? { id: product.category.id, name: product.category.name } : null,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        barcode: variant.barcode,
        color: variant.color,
        size: variant.size,
        weight: variant.weight,
        length: variant.length,
        width: variant.width,
        height: variant.height,
        suggestedPrice: variant.suggestedPrice,
        minStock: variant.minStock,
        status: variant.status,
        latestCost: variant.costHistory[0]?.cost ?? null,
        inventory: {
          available: variant.inventory?.available ?? 0,
          reserved: variant.inventory?.reserved ?? 0,
        },
      })),
    };
  }

  async findProductOrThrow(id: string, companyId: string) {
    const product = await this.prisma.client.product.findFirst({ where: { id, companyId } });
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }
    return product;
  }

  private async assertCategoryBelongsToCompany(categoryId: string, companyId: string) {
    const category = await this.prisma.client.category.findFirst({
      where: { id: categoryId, companyId },
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }
  }

  async create(companyId: string, dto: CreateProductDto) {
    if (dto.categoryId) {
      await this.assertCategoryBelongsToCompany(dto.categoryId, companyId);
    }

    try {
      return await this.prisma.client.product.create({
        data: {
          companyId,
          name: dto.name,
          description: dto.description ?? null,
          categoryId: dto.categoryId ?? null,
          brand: dto.brand ?? null,
          baseSku: dto.baseSku,
          imageUrl: dto.imageUrl ?? null,
          ...(dto.status ? { status: dto.status } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe um produto com esse SKU base');
      }
      throw error;
    }
  }

  async update(id: string, companyId: string, dto: UpdateProductDto) {
    const existing = await this.findProductOrThrow(id, companyId);

    if (dto.categoryId) {
      await this.assertCategoryBelongsToCompany(dto.categoryId, companyId);
    }

    try {
      const updated = await this.prisma.client.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.brand !== undefined ? { brand: dto.brand } : {}),
          ...(dto.baseSku !== undefined ? { baseSku: dto.baseSku } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
      return { old: existing, updated };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe um produto com esse SKU base');
      }
      throw error;
    }
  }

  async getVariantOrThrow(variantId: string, companyId: string) {
    const variant = await this.prisma.client.productVariant.findFirst({
      where: { id: variantId, product: { companyId } },
      include: { product: true },
    });
    if (!variant) {
      throw new NotFoundException('Variante não encontrada');
    }
    return variant;
  }

  async createVariant(productId: string, companyId: string, dto: CreateVariantDto) {
    await this.findProductOrThrow(productId, companyId);

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const variant = await tx.productVariant.create({
          data: {
            productId,
            sku: dto.sku,
            barcode: dto.barcode ?? null,
            color: dto.color ?? null,
            size: dto.size ?? null,
            weight: dto.weight ?? null,
            length: dto.length ?? null,
            width: dto.width ?? null,
            height: dto.height ?? null,
            suggestedPrice: dto.suggestedPrice,
            ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
            ...(dto.status ? { status: dto.status } : {}),
          },
        });

        await tx.inventory.create({
          data: {
            companyId,
            variantId: variant.id,
            available: 0,
            reserved: 0,
          },
        });

        return variant;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe uma variante com esse SKU');
      }
      throw error;
    }
  }

  async updateVariant(variantId: string, companyId: string, dto: UpdateVariantDto) {
    const existing = await this.getVariantOrThrow(variantId, companyId);

    try {
      const updated = await this.prisma.client.productVariant.update({
        where: { id: variantId },
        data: {
          ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
          ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.size !== undefined ? { size: dto.size } : {}),
          ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
          ...(dto.length !== undefined ? { length: dto.length } : {}),
          ...(dto.width !== undefined ? { width: dto.width } : {}),
          ...(dto.height !== undefined ? { height: dto.height } : {}),
          ...(dto.suggestedPrice !== undefined ? { suggestedPrice: dto.suggestedPrice } : {}),
          ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
      return { old: existing, updated };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe uma variante com esse SKU');
      }
      throw error;
    }
  }

  async getCostHistory(variantId: string, companyId: string) {
    await this.getVariantOrThrow(variantId, companyId);
    return this.prisma.client.productCostHistory.findMany({
      where: { variantId },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  async createCostHistory(variantId: string, companyId: string, dto: CreateCostHistoryDto) {
    await this.getVariantOrThrow(variantId, companyId);
    return this.prisma.client.productCostHistory.create({
      data: {
        variantId,
        cost: dto.cost,
        effectiveDate: new Date(dto.effectiveDate),
        note: dto.note ?? null,
      },
    });
  }
}
