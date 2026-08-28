import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    const channels = await this.prisma.client.salesChannel.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });

    return channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      isManual: channel.isManual,
      isActive: channel.isActive,
    }));
  }
}
