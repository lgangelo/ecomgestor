import { Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationProvider } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    const integrations = await this.prisma.client.integration.findMany({
      where: { companyId },
      orderBy: { provider: 'asc' },
    });

    return integrations.map((i) => ({
      provider: i.provider,
      status: i.status,
      storeName: i.storeName,
      lastSyncAt: i.lastSyncAt,
      channelId: i.channelId,
    }));
  }

  async findOne(companyId: string, provider: IntegrationProvider) {
    const integration = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider } },
    });
    if (!integration) {
      throw new NotFoundException('Integração não encontrada');
    }

    const [ordersCount, productsMappedCount] = integration.channelId
      ? await Promise.all([
          this.prisma.client.order.count({ where: { channelId: integration.channelId } }),
          this.prisma.client.channelProductMapping.count({
            where: { channelId: integration.channelId },
          }),
        ])
      : [0, 0];

    return {
      provider: integration.provider,
      status: integration.status,
      storeName: integration.storeName,
      lastSyncAt: integration.lastSyncAt,
      channelId: integration.channelId,
      ordersCount,
      productsMappedCount,
    };
  }
}
