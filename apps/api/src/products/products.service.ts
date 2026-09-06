import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Prisma, ProductStatus } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { R2StorageService } from '../common/storage/r2-storage.service';
import { paginate } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateCostHistoryDto } from './dto/create-cost-history.dto';

// Teto do que fica de fato salvo/servido — nunca sobe sem repensar o custo de storage/CDN.
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
// Teto do upload BRUTO aceito, antes de comprimir — celulares modernos (ex.: iPhone 16 Pro Max,
// pedido explícito do usuário) tiram fotos de 8-15MB em alta qualidade; rejeitar de cara sem
// tentar comprimir primeiro perderia fotos perfeitamente válidas.
const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
// Lado maior, em pixels — bem acima do necessário pra exibição web/marketplace, mas suficiente
// pra manter nitidez em zoom. Fotos já menores que isso não são redimensionadas.
const MAX_IMAGE_DIMENSION_PX = 2048;
// Tenta cada qualidade JPEG em ordem até caber em MAX_IMAGE_SIZE_BYTES — perde o mínimo de
// qualidade necessário, nunca comprime mais do que precisa.
const JPEG_COMPRESSION_QUALITIES = [85, 75, 65, 55, 45];
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
// Espelhamento de foto externa (ex.: CDN da TikTok) — nunca deixa pendurado esperando um host de
// terceiro que pode estar lento/inacessível pra sempre.
const MIRROR_EXTERNAL_IMAGE_TIMEOUT_MS = 10_000;
// Limite de fotos na galeria adicional do produto (nunca conta a foto de capa, `Product.imageUrl`,
// que é independente) — pedido explícito do usuário.
const MAX_PRODUCT_IMAGES = 5;
// 1 vídeo por produto (pedido do usuário, pra usar em TikTok Shop/Shopee) — teto alinhado ao
// maior limite confirmado entre os dois canais (TikTok Shop aceita até 100MB; Shopee só até
// 30MB, mas quem valida o teto de cada canal é a própria sincronização daquele canal, nunca
// aqui — aqui só guardamos o arquivo original, sem recomprimir/transcodificar, ao contrário de
// foto: não há uma lib de vídeo equivalente ao `sharp` disponível nesta stack).
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const VIDEO_MIME_TO_EXT: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

/** Nome de arquivo baseado no SKU (`K908-1.jpg`, nunca um UUID aleatório) — pedido explícito do
 * usuário, pra dar pra identificar visualmente de qual produto/variante é cada foto no bucket e
 * facilitar auditoria/limpeza manual depois (ver `cleanup-orphaned-product-images.ts`). Caracteres
 * fora de [A-Za-z0-9_-] viram "-" (SKU pode ter espaço/acento em teoria, embora raro na prática). */
function sanitizeSlug(slug: string): string {
  return slug
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly r2: R2StorageService,
  ) {}

  async findAll(companyId: string, query: QueryProductDto) {
    const where: Prisma.ProductWhereInput = {
      companyId,
      // Busca por SKU de variação também — na maioria dos casos ela é derivada do SKU base
      // ("{baseSku}-1", "{baseSku}-2", ...), mas uma variação pode ter um SKU totalmente
      // diferente (editado manualmente, ou de antes de o produto passar por uma renomeação de
      // SKU base), e buscar só pelo SKU base nunca encontrava esse caso.
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { baseSku: { contains: query.search, mode: 'insensitive' as const } },
              { variants: { some: { sku: { contains: query.search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.brand ? { brand: { equals: query.brand, mode: 'insensitive' as const } } : {}),
    };

    const include = {
      category: { select: { name: true } },
      variants: {
        select: {
          suggestedPrice: true,
          inventory: { select: { onHand: true, reserved: true } },
        },
      },
    } as const;

    function toItem(product: Prisma.ProductGetPayload<{ include: typeof include }>) {
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
    }

    // `totalAvailable` é `onHand - reserved` somado entre variações — não dá pra filtrar isso
    // direto no Prisma (mesma limitação já documentada em `computeAttention`, reports.service.ts:
    // não existe filtro nativo para uma expressão entre colunas). Com o filtro "só com estoque"
    // ativo, busca TODOS os produtos que batem com os demais filtros (sem paginar no banco),
    // filtra por saldo em memória, e só então pagina o resultado já filtrado — senão a página
    // (e o total) ficariam errados, contando produtos sem estoque que nunca deveriam aparecer.
    if (query.hasStock) {
      const all = await this.prisma.client.product.findMany({ where, include, orderBy: { createdAt: 'desc' } });
      const items = all.map(toItem).filter((item) => item.totalAvailable > 0);
      const start = (query.page - 1) * query.pageSize;
      return paginate(items.slice(start, start + query.pageSize), items.length, query.page, query.pageSize);
    }

    const [products, total] = await Promise.all([
      this.prisma.client.product.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.product.count({ where }),
    ]);

    return paginate(products.map(toItem), total, query.page, query.pageSize);
  }

  async findOne(id: string, companyId: string) {
    const product = await this.prisma.client.product.findFirst({
      where: { id, companyId },
      include: {
        category: { select: { id: true, name: true } },
        images: { orderBy: { position: 'asc' } },
        variants: {
          include: {
            // Desempate por createdAt: duas entradas registradas no mesmo dia (comum, o diálogo sempre
            // sugere a data de hoje) ficam com o mesmo effectiveDate exato — sem desempate, a mais
            // recente podia não ser a retornada (confirmado: "definir custo de novo não atualiza").
            costHistory: { orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], take: 1 },
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
      videoUrl: product.videoUrl,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      category: product.category ? { id: product.category.id, name: product.category.name } : null,
      // Galeria adicional (até MAX_PRODUCT_IMAGES) — independente da foto de capa (`imageUrl`),
      // que pode ou não coincidir com uma delas.
      images: product.images.map((image) => ({ id: image.id, url: image.url, position: image.position })),
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
        imageUrl: variant.imageUrl,
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

  /**
   * Trocar o SKU base renumera as variações automaticamente — "{baseSku}-1", "{baseSku}-2", ...
   * (ordem de criação) quando há mais de uma; com uma única variação, ela recebe o próprio SKU
   * base direto, sem sufixo (não faz sentido "-1" para algo que não é realmente uma "variação").
   */
  async update(id: string, companyId: string, dto: UpdateProductDto) {
    const existing = await this.findProductOrThrow(id, companyId);

    if (dto.categoryId) {
      await this.assertCategoryBelongsToCompany(dto.categoryId, companyId);
    }

    const baseSkuChanged = dto.baseSku !== undefined && dto.baseSku !== existing.baseSku;

    try {
      const updated = await this.prisma.client.$transaction(async (tx) => {
        const updatedProduct = await tx.product.update({
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

        if (baseSkuChanged) {
          const variants = await tx.productVariant.findMany({ where: { productId: id }, orderBy: { createdAt: 'asc' } });
          if (variants.length === 1) {
            await tx.productVariant.update({ where: { id: variants[0].id }, data: { sku: dto.baseSku! } });
          } else {
            for (let i = 0; i < variants.length; i++) {
              await tx.productVariant.update({ where: { id: variants[i].id }, data: { sku: `${dto.baseSku}-${i + 1}` } });
            }
          }
        }

        return updatedProduct;
      });
      return { old: existing, updated };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe um produto ou variante com esse SKU');
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

  /** Ativação/inativação em massa (sem a regra de bloqueio da exclusão — mudar status nunca
   * apaga histórico). Só afeta produtos que realmente pertencem à empresa; ids de outra empresa
   * ou inexistentes entram em `notFound` em vez de silenciosamente não fazer nada. */
  async updateManyStatus(
    ids: string[],
    companyId: string,
    status: ProductStatus,
  ): Promise<{ updated: string[]; notFound: string[] }> {
    const products = await this.prisma.client.product.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true },
    });
    const updated = products.map((p) => p.id);
    const notFound = ids.filter((id) => !updated.includes(id));

    if (updated.length > 0) {
      await this.prisma.client.product.updateMany({
        where: { id: { in: updated } },
        data: { status },
      });
    }

    return { updated, notFound };
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
            imageUrl: dto.imageUrl ?? null,
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
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
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
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
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

  /** Registra o MESMO custo para todas as variações do produto de uma vez — para o caso comum
   * de um produto cujas variações só diferem por cor (custo igual entre elas). Quando o custo
   * realmente varia por variação (ex.: tamanho), o operador continua podendo registrar
   * individualmente por SKU via `createCostHistory`. */
  async createCostHistoryForAllVariants(productId: string, companyId: string, dto: CreateCostHistoryDto) {
    const product = await this.findProductOrThrow(productId, companyId);
    const variants = await this.prisma.client.productVariant.findMany({
      where: { productId: product.id },
      select: { id: true },
    });
    const effectiveDate = new Date(dto.effectiveDate);
    return this.prisma.client.$transaction(
      variants.map((variant) =>
        this.prisma.client.productCostHistory.create({
          data: { variantId: variant.id, cost: dto.cost, effectiveDate, note: dto.note ?? null },
        }),
      ),
    );
  }

  /** Aba "Resumo" (seção 4) — agrega estoque e vendas dos últimos 30 dias de todas as variantes. */
  async getSummary(productId: string, companyId: string) {
    const product = await this.findProductOrThrow(productId, companyId);
    const variants = await this.prisma.client.productVariant.findMany({
      where: { productId },
      include: {
        inventory: true,
        // Desempate por createdAt: duas entradas registradas no mesmo dia (comum, o diálogo sempre
            // sugere a data de hoje) ficam com o mesmo effectiveDate exato — sem desempate, a mais
            // recente podia não ser a retornada (confirmado: "definir custo de novo não atualiza").
            costHistory: { orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], take: 1 },
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
    // `unitPrice` já vem líquido dos dois descontos (confirmado contra o extrato real da TikTok)
    // — soma-se de volta o desconto que a TikTok bancou (o do vendedor já está embutido e nunca
    // se subtrai de novo).
    const revenue30d = recentItems.reduce(
      (sum, i) => sum + Number(i.unitPrice) * i.quantity + Number(i.platformDiscount),
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
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
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

  private validateImageFile(file: UploadedImageFile) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException(`Imagem excede o tamanho máximo de ${MAX_UPLOAD_SIZE_BYTES / 1024 / 1024}MB`);
    }
  }

  /** Pedido do usuário: fotos "alta qualidade" de celular (iPhone 16 Pro Max e afins) passam
   * fácil de 5MB — em vez de rejeitar de cara, converte pra JPEG e recomprime até caber no teto
   * de armazenamento, reduzindo qualidade só o necessário (nunca mais que isso). Aceita qualquer
   * formato que o `sharp`/libvips souber decodificar (JPEG/PNG/WEBP/HEIC/HEIF...) — um arquivo
   * que não é imagem de verdade vira erro claro, nunca uma exceção crua de decodificação.
   *
   * Atalho: um JPEG/PNG/WEBP que já cabe no teto sai sem nenhum processamento — nunca perde
   * qualidade à toa numa foto que já estava dentro do limite.
   */
  private async normalizeImage(file: UploadedImageFile): Promise<{ buffer: Buffer; mimetype: string }> {
    if (file.size <= MAX_IMAGE_SIZE_BYTES && MIME_TO_EXT[file.mimetype]) {
      return { buffer: file.buffer, mimetype: file.mimetype };
    }

    const compress = async (quality: number) =>
      sharp(file.buffer)
        .rotate() // aplica a orientação EXIF antes de redimensionar — sem isso, foto tirada com o
        // celular "de lado" fica deitada depois de salva.
        .resize({ width: MAX_IMAGE_DIMENSION_PX, height: MAX_IMAGE_DIMENSION_PX, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();

    let buffer: Buffer;
    try {
      buffer = await compress(JPEG_COMPRESSION_QUALITIES[0]);
    } catch {
      throw new BadRequestException(
        'Não foi possível processar esta imagem — tente exportar como JPEG antes de enviar.',
      );
    }
    for (const quality of JPEG_COMPRESSION_QUALITIES.slice(1)) {
      if (buffer.length <= MAX_IMAGE_SIZE_BYTES) break;
      buffer = await compress(quality);
    }
    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException(
        `Não foi possível comprimir a imagem abaixo de ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB mesmo reduzindo a qualidade — tente uma foto com resolução menor.`,
      );
    }
    return { buffer, mimetype: 'image/jpeg' };
  }

  /**
   * Grava a foto — no bucket público do R2 (`R2_IMAGES_BUCKET`, servido pelo domínio customizado
   * `R2_IMAGES_PUBLIC_BASE_URL`) quando configurado, senão em disco local (compatibilidade com
   * instalações que ainda não migraram, mesmo path servido por
   * `GET /products/images/:companyId/:filename`). Nunca mistura os dois: a escolha é feita uma
   * vez, no momento do upload, e o tipo de URL devolvida (absoluta do R2 vs. relativa local) é o
   * que diferencia os dois casos depois (ver `deleteImageIfAny`).
   */
  private async saveImageFile(companyId: string, file: UploadedImageFile, slug?: string): Promise<string> {
    this.validateImageFile(file);
    const normalized = await this.normalizeImage(file);
    const filename = `${(slug && sanitizeSlug(slug)) || randomUUID()}${MIME_TO_EXT[normalized.mimetype]}`;
    const r2Config = this.config.get<{ enabled: boolean; imagesBucket: string; imagesPublicBaseUrl: string }>('r2')!;
    if (r2Config.enabled) {
      const key = `imagens/${companyId}/${filename}`;
      await this.r2.putObject(r2Config.imagesBucket, key, normalized.buffer, normalized.mimetype);
      return `${r2Config.imagesPublicBaseUrl}/${key}`;
    }
    const dir = join(this.config.get<string>('productImageStorageDir')!, companyId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), normalized.buffer);
    return `/products/images/${companyId}/${filename}`;
  }

  /** Best-effort: apaga a foto anterior ao trocar por uma nova — só quando ela foi armazenada por
   * este mesmo mecanismo (R2 público ou disco local), nunca uma URL externa de verdade (ex.: uma
   * ainda não migrada de um canal externo). */
  private async deleteImageIfAny(companyId: string, previousImageUrl: string | null) {
    if (!previousImageUrl) return;
    const r2Config = this.config.get<{ imagesBucket: string; imagesPublicBaseUrl: string }>('r2')!;
    if (r2Config.imagesPublicBaseUrl && previousImageUrl.startsWith(`${r2Config.imagesPublicBaseUrl}/`)) {
      const key = previousImageUrl.slice(`${r2Config.imagesPublicBaseUrl}/`.length);
      try {
        await this.r2.deleteObject(r2Config.imagesBucket, key);
      } catch {
        // Best-effort — nunca bloqueia a troca por causa de uma falha ao apagar a antiga.
      }
      return;
    }
    const prefix = `/products/images/${companyId}/`;
    if (!previousImageUrl.startsWith(prefix)) return;
    const filename = previousImageUrl.slice(prefix.length);
    try {
      await unlink(join(this.config.get<string>('productImageStorageDir')!, companyId, filename));
    } catch {
      // Best-effort — o arquivo já pode não existir (ex.: volume recriado). Nunca bloqueia a troca.
    }
  }

  async uploadProductImage(id: string, companyId: string, file: UploadedImageFile) {
    const existing = await this.findProductOrThrow(id, companyId);
    const imageUrl = await this.saveImageFile(companyId, file, existing.baseSku);
    await this.deleteImageIfAny(companyId, existing.imageUrl);
    return this.prisma.client.product.update({ where: { id }, data: { imageUrl } });
  }

  private validateVideoFile(file: UploadedImageFile) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    if (!VIDEO_MIME_TO_EXT[file.mimetype]) {
      throw new BadRequestException('Formato de vídeo não suportado — envie um arquivo MP4, MOV ou WEBM.');
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      throw new BadRequestException(`Vídeo excede o tamanho máximo de ${MAX_VIDEO_SIZE_BYTES / 1024 / 1024}MB`);
    }
  }

  /** Mesmo esquema de armazenamento de `saveImageFile` (R2 público quando configurado, senão disco
   * local), mas sem nenhum processamento do arquivo — guarda o vídeo original como veio, validando
   * só formato/tamanho antes. */
  private async saveVideoFile(companyId: string, file: UploadedImageFile, slug?: string): Promise<string> {
    this.validateVideoFile(file);
    const filename = `${(slug && sanitizeSlug(slug)) || randomUUID()}${VIDEO_MIME_TO_EXT[file.mimetype]}`;
    const r2Config = this.config.get<{ enabled: boolean; imagesBucket: string; imagesPublicBaseUrl: string }>('r2')!;
    if (r2Config.enabled) {
      const key = `videos/${companyId}/${filename}`;
      await this.r2.putObject(r2Config.imagesBucket, key, file.buffer, file.mimetype);
      return `${r2Config.imagesPublicBaseUrl}/${key}`;
    }
    const dir = join(this.config.get<string>('productVideoStorageDir')!, companyId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), file.buffer);
    return `/products/videos/${companyId}/${filename}`;
  }

  /** Mesma filosofia best-effort de `deleteImageIfAny`. */
  private async deleteVideoIfAny(companyId: string, previousVideoUrl: string | null) {
    if (!previousVideoUrl) return;
    const r2Config = this.config.get<{ imagesBucket: string; imagesPublicBaseUrl: string }>('r2')!;
    if (r2Config.imagesPublicBaseUrl && previousVideoUrl.startsWith(`${r2Config.imagesPublicBaseUrl}/`)) {
      const key = previousVideoUrl.slice(`${r2Config.imagesPublicBaseUrl}/`.length);
      try {
        await this.r2.deleteObject(r2Config.imagesBucket, key);
      } catch {
        // Best-effort — nunca bloqueia a troca por causa de uma falha ao apagar o anterior.
      }
      return;
    }
    const prefix = `/products/videos/${companyId}/`;
    if (!previousVideoUrl.startsWith(prefix)) return;
    const filename = previousVideoUrl.slice(prefix.length);
    try {
      await unlink(join(this.config.get<string>('productVideoStorageDir')!, companyId, filename));
    } catch {
      // Best-effort — o arquivo já pode não existir. Nunca bloqueia a troca.
    }
  }

  async uploadProductVideo(id: string, companyId: string, file: UploadedImageFile) {
    const existing = await this.findProductOrThrow(id, companyId);
    const videoUrl = await this.saveVideoFile(companyId, file, existing.baseSku);
    await this.deleteVideoIfAny(companyId, existing.videoUrl);
    return this.prisma.client.product.update({ where: { id }, data: { videoUrl } });
  }

  async removeProductVideo(id: string, companyId: string) {
    const existing = await this.findProductOrThrow(id, companyId);
    await this.deleteVideoIfAny(companyId, existing.videoUrl);
    return this.prisma.client.product.update({ where: { id }, data: { videoUrl: null } });
  }

  async uploadVariantImage(variantId: string, companyId: string, file: UploadedImageFile) {
    const existing = await this.getVariantOrThrow(variantId, companyId);
    const imageUrl = await this.saveImageFile(companyId, file, existing.sku);
    await this.deleteImageIfAny(companyId, existing.imageUrl);
    return this.prisma.client.productVariant.update({ where: { id: variantId }, data: { imageUrl } });
  }

  /** Galeria de fotos adicionais do produto (nunca a foto de capa, que continua sendo só
   * `Product.imageUrl` — ver comentário no schema). Adiciona ao final (maior `position` + 1) —
   * usa o maior `position` já existente, nunca a contagem de linhas: depois de remover uma foto do
   * meio da galeria, contar linhas geraria a mesma posição (e o mesmo nome de arquivo por SKU) de
   * uma foto irmã ainda existente, sobrescrevendo o arquivo dela no bucket. */
  async addProductImage(productId: string, companyId: string, file: UploadedImageFile) {
    const product = await this.findProductOrThrow(productId, companyId);
    const count = await this.prisma.client.productImage.count({ where: { productId } });
    if (count >= MAX_PRODUCT_IMAGES) {
      throw new BadRequestException(`Cada produto pode ter no máximo ${MAX_PRODUCT_IMAGES} fotos na galeria.`);
    }
    const maxPosition = await this.prisma.client.productImage.aggregate({ where: { productId }, _max: { position: true } });
    const position = (maxPosition._max.position ?? -1) + 1;
    const seq = String(position + 1).padStart(3, '0');
    const url = await this.saveImageFile(companyId, file, `${product.baseSku}-${seq}`);
    return this.prisma.client.productImage.create({ data: { productId, url, position } });
  }

  private async getProductImageOrThrow(productId: string, imageId: string, companyId: string) {
    await this.findProductOrThrow(productId, companyId);
    const image = await this.prisma.client.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException('Foto não encontrada');
    return image;
  }

  async removeProductImage(productId: string, imageId: string, companyId: string) {
    const image = await this.getProductImageOrThrow(productId, imageId, companyId);
    await this.deleteImageIfAny(companyId, image.url);
    await this.prisma.client.productImage.delete({ where: { id: imageId } });
  }

  /** Promove uma foto da galeria a foto de CAPA (`Product.imageUrl`) — nunca apaga a capa
   * anterior do disco: ela pode ainda estar referenciada em outro lugar (ex.: uma foto que também
   * está na galeria), diferente de `uploadProductImage`, que sabe que está SUBSTITUINDO a única
   * referência a ela. */
  async setProductCoverImage(productId: string, imageId: string, companyId: string) {
    const image = await this.getProductImageOrThrow(productId, imageId, companyId);
    return this.prisma.client.product.update({ where: { id: productId }, data: { imageUrl: image.url } });
  }

  /** Path absoluto no disco de uma foto já salva — usado só pelo endpoint de servir imagem
   * (`GET /products/images/:companyId/:filename`), depois de o controller já ter confirmado que
   * `companyId` bate com a empresa do usuário autenticado. */
  resolveImageFilePath(companyId: string, filename: string): string {
    return join(this.config.get<string>('productImageStorageDir')!, companyId, filename);
  }

  resolveVideoFilePath(companyId: string, filename: string): string {
    return join(this.config.get<string>('productVideoStorageDir')!, companyId, filename);
  }

  /**
   * Baixa uma foto hospedada num domínio externo (ex.: CDN da TikTok) e grava no nosso próprio
   * armazenamento, devolvendo o mesmo formato de path servido por `GET /products/images/...` que
   * `saveImageFile` já devolve para upload manual — usado pela sincronização de canais (TikTok
   * Shop) pra nunca depender de um domínio de terceiro estar acessível a partir de QUALQUER rede
   * do operador. CONFIRMADO em produção: uma rede móvel bloqueando o CDN da TikTok fazia a foto
   * sumir só naquele aparelho/rede, mesmo com a URL correta — servir sempre pelo nosso próprio
   * domínio elimina essa dependência de vez.
   *
   * Lança em qualquer falha (rede, timeout, formato não suportado, tamanho excedido) — quem chama
   * decide o fallback (manter a URL externa original), nunca bloqueia o fluxo de sincronização por
   * causa disso.
   */
  async mirrorExternalImage(companyId: string, externalUrl: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MIRROR_EXTERNAL_IMAGE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(externalUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(`Falha ao baixar imagem externa (HTTP ${response.status})`);
    }
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    const buffer = Buffer.from(await response.arrayBuffer());
    return this.saveImageFile(companyId, {
      originalname: 'external',
      mimetype: contentType,
      size: buffer.length,
      buffer,
    });
  }
}
