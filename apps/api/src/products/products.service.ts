import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
              inventory: { select: { onHand: true, reserved: true } },
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
        (sum, v) => sum + (v.inventory ? v.inventory.onHand - v.inventory.reserved : 0),
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
          onHand: variant.inventory?.onHand ?? 0,
          available: variant.inventory ? variant.inventory.onHand - variant.inventory.reserved : 0,
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

  /**
   * Exclusão só local (nunca chama o marketplace — se veio de uma integração, o registro de lá
   * não é afetado). Bloqueada quando existe histórico real (pedido, movimentação de estoque ou
   * entrada) em qualquer variante — apagar isso seria perder dado de negócio de verdade; nesses
   * casos o caminho é marcar o produto/variante como "Inativo", não excluir. Vínculos que são só
   * operacionais (mapeamento de canal, saldo de estoque zerado, contagem, outbox de sincronização)
   * são removidos junto, já que não têm significado sem o produto.
   *
   * A movimentação de estoque da PRÓPRIA carga inicial da TikTok Shop (`referenceType`
   * `tiktok_import`/`tiktok_sync`) não conta como "histórico real" aqui — sem essa exceção, todo
   * produto criado já com estoque via importação ficaria travado pra sempre, mesmo sem nenhuma
   * venda ou entrada de verdade (confirmado em produção: bloqueava exclusão de produtos recém
   * importados que nunca tiveram pedido nem entrada).
   */
  async remove(id: string, companyId: string) {
    const product = await this.prisma.client.product.findFirst({
      where: { id, companyId },
      include: { variants: { select: { id: true } } },
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const variantIds = product.variants.map((v) => v.id);

    const [orderItemCount, movementCount, stockEntryCount] = await Promise.all([
      this.prisma.client.orderItem.count({ where: { variantId: { in: variantIds } } }),
      this.prisma.client.inventoryMovement.count({
        where: { variantId: { in: variantIds }, referenceType: { notIn: ['tiktok_import', 'tiktok_sync'] } },
      }),
      this.prisma.client.stockEntryItem.count({ where: { variantId: { in: variantIds } } }),
    ]);

    if (orderItemCount > 0 || movementCount > 0 || stockEntryCount > 0) {
      throw new BadRequestException(
        'Não é possível excluir: este produto já tem pedidos, movimentações de estoque ou entradas registradas. Marque como "Inativo" em vez de excluir.',
      );
    }

    await this.prisma.client.$transaction([
      this.prisma.client.channelProductMapping.deleteMany({ where: { variantId: { in: variantIds } } }),
      this.prisma.client.inventoryCountItem.deleteMany({ where: { variantId: { in: variantIds } } }),
      this.prisma.client.stockSyncOutboxEntry.deleteMany({ where: { variantId: { in: variantIds } } }),
      // Só sobra movimentação de carga/sincronização da TikTok aqui (a checagem acima já garante
      // que nenhuma outra existe) — segura pra apagar junto, senão a FK bloquearia a exclusão da
      // variante.
      this.prisma.client.inventoryMovement.deleteMany({ where: { variantId: { in: variantIds } } }),
      this.prisma.client.inventory.deleteMany({ where: { variantId: { in: variantIds } } }),
      this.prisma.client.productVariant.deleteMany({ where: { productId: id } }),
      this.prisma.client.product.delete({ where: { id } }),
    ]);

    return product;
  }

  /** Exclusão em massa — mesma regra de segurança de `remove` aplicada individualmente a cada
   * produto; um produto com histórico real (ou qualquer outro erro) nunca aborta os demais, só
   * entra na lista de falhas. */
  async removeMany(ids: string[], companyId: string): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> {
    const deleted: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        await this.remove(id, companyId);
        deleted.push(id);
      } catch (error) {
        failed.push({ id, error: error instanceof Error ? error.message : 'Erro desconhecido' });
      }
    }

    return { deleted, failed };
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
            onHand: 0,
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

  /** Aba "Resumo" (seção 4) — agrega estoque e vendas dos últimos 30 dias de todas as variantes. */
  async getSummary(productId: string, companyId: string) {
    const product = await this.findProductOrThrow(productId, companyId);
    const variants = await this.prisma.client.productVariant.findMany({
      where: { productId },
      include: {
        inventory: true,
        costHistory: { orderBy: { effectiveDate: 'desc' }, take: 1 },
      },
    });
    const variantIds = variants.map((v) => v.id);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentItems = await this.prisma.client.orderItem.findMany({
      where: {
        variantId: { in: variantIds },
        order: { companyId, orderDate: { gte: thirtyDaysAgo }, status: { not: 'CANCELLED' } },
      },
    });

    const available = variants.reduce((sum, v) => sum + (v.inventory ? v.inventory.onHand - v.inventory.reserved : 0), 0);
    const reserved = variants.reduce((sum, v) => sum + (v.inventory?.reserved ?? 0), 0);
    const costs = variants.map((v) => Number(v.costHistory[0]?.cost ?? 0)).filter((c) => c > 0);
    const suggestedPrices = variants.map((v) => Number(v.suggestedPrice));

    const unitsSold30d = recentItems.reduce((sum, i) => sum + i.quantity, 0);
    const revenue30d = recentItems.reduce(
      (sum, i) => sum + Number(i.unitPrice) * i.quantity - Number(i.sellerDiscount) - Number(i.platformDiscount),
      0,
    );
    const cmv30d = recentItems.reduce((sum, i) => sum + Number(i.unitCost) * i.quantity, 0);
    const estimatedProfit30d = revenue30d - cmv30d;
    const avgSoldPrice30d = unitsSold30d > 0 ? revenue30d / unitsSold30d : null;
    const avgMargin30d = revenue30d > 0 ? (estimatedProfit30d / revenue30d) * 100 : null;

    return {
      productId: product.id,
      name: product.name,
      status: product.status,
      available,
      reserved,
      currentCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
      suggestedPrice: suggestedPrices.length ? suggestedPrices.reduce((a, b) => a + b, 0) / suggestedPrices.length : null,
      avgSoldPrice30d: avgSoldPrice30d !== null ? Math.round(avgSoldPrice30d * 100) / 100 : null,
      unitsSold30d,
      revenue30d: Math.round(revenue30d * 100) / 100,
      estimatedProfit30d: Math.round(estimatedProfit30d * 100) / 100,
      avgMargin30d: avgMargin30d !== null ? Math.round(avgMargin30d * 100) / 100 : null,
    };
  }

  /** Aba "Estoque" — ledger combinado de todas as variantes do produto. */
  async getMovements(productId: string, companyId: string) {
    await this.findProductOrThrow(productId, companyId);
    const variants = await this.prisma.client.productVariant.findMany({
      where: { productId },
      select: { id: true },
    });
    return this.prisma.client.inventoryMovement.findMany({
      where: { companyId, variantId: { in: variants.map((v) => v.id) } },
      include: { variant: { select: { sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Aba "Custos" — timeline combinada de todas as variantes do produto. */
  async getAllCostHistory(productId: string, companyId: string) {
    await this.findProductOrThrow(productId, companyId);
    const variants = await this.prisma.client.productVariant.findMany({
      where: { productId },
      select: { id: true, sku: true },
    });
    const history = await this.prisma.client.productCostHistory.findMany({
      where: { variantId: { in: variants.map((v) => v.id) } },
      orderBy: { effectiveDate: 'desc' },
    });
    const skuByVariant = new Map(variants.map((v) => [v.id, v.sku]));
    return history.map((h) => ({ ...h, sku: skuByVariant.get(h.variantId) ?? null }));
  }

  /** Aba "Canais" — mapeamentos de todas as variantes do produto. */
  async getChannelMappings(productId: string, companyId: string) {
    await this.findProductOrThrow(productId, companyId);
    const variants = await this.prisma.client.productVariant.findMany({
      where: { productId },
      select: { id: true, sku: true },
    });
    const mappings = await this.prisma.client.channelProductMapping.findMany({
      where: { variantId: { in: variants.map((v) => v.id) } },
      include: { channel: { select: { name: true, type: true } } },
    });
    const skuByVariant = new Map(variants.map((v) => [v.id, v.sku]));
    return mappings.map((m) => ({
      id: m.id,
      sku: m.variantId ? (skuByVariant.get(m.variantId) ?? null) : null,
      channelName: m.channel.name,
      channelType: m.channel.type,
      externalProductId: m.externalProductId,
      externalSku: m.externalSku,
      syncStatus: m.syncStatus,
    }));
  }
}
