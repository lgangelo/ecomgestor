import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { prisma, PrismaClient } from '@ecommerce-manager/database';

/**
 * Wrapper fino sobre o PrismaClient compartilhado do pacote @ecommerce-manager/database,
 * integrado ao ciclo de vida do Nest (conecta no boot, desconecta no shutdown).
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient = prisma;

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
