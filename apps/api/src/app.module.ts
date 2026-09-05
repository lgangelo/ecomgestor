import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { StorageModule } from './common/storage/storage.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { AppLoggerModule } from './common/logger/app-logger.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { QueueModule } from './queue/queue.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { InventoryModule } from './inventory/inventory.module';
import { ChannelsModule } from './channels/channels.module';
import { OrdersModule } from './orders/orders.module';
import { ReturnsModule } from './returns/returns.module';
import { FinanceModule } from './finance/finance.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { ReportsModule } from './reports/reports.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { TikTokModule } from './integrations/tiktok/tiktok.module';
import { ShopeeModule } from './integrations/shopee/shopee.module';
import { MercadoLivreModule } from './integrations/mercadolivre/mercadolivre.module';
import { TikTokStockOutboxSchedulerModule } from './integrations/tiktok/tiktok-stock-outbox-scheduler.module';
import { MercadoLivreStockOutboxSchedulerModule } from './integrations/mercadolivre/mercadolivre-stock-outbox-scheduler.module';
import { CompanyModule } from './company/company.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { SearchModule } from './search/search.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
    AppLoggerModule,
    JwtModule.register({}),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
    PrismaModule,
    RedisModule,
    StorageModule,
    QueueModule,
    AuditModule,
    AuthModule,
    HealthModule,
    CategoriesModule,
    ProductsModule,
    SuppliersModule,
    InventoryModule,
    ChannelsModule,
    OrdersModule,
    ReturnsModule,
    FinanceModule,
    FiscalModule,
    ReportsModule,
    // TikTokModule ANTES de IntegrationsModule: as duas rotas colidem no mesmo path literal
    // (ex.: POST /integrations/tiktok/disconnect também bate no stub genérico
    // POST /integrations/:provider/disconnect) — o Nest despacha para quem registrou primeiro,
    // então o controller específico do TikTok precisa vir antes do stub genérico (que nem
    // reconheceria "tiktok" como valor do enum IntegrationProvider, só "TIKTOK_SHOP").
    TikTokModule,
    // Mesmo motivo do comentário acima sobre o TikTokModule — precisa vir antes do
    // IntegrationsModule genérico.
    ShopeeModule,
    MercadoLivreModule,
    IntegrationsModule,
    TikTokStockOutboxSchedulerModule,
    MercadoLivreStockOutboxSchedulerModule,
    CompanyModule,
    UsersModule,
    RolesModule,
    SearchModule,
    NotificationsModule,
    JobsModule,
    OnboardingModule,
    AiModule,
  ],
  providers: [
    // Ordem importa: rate limit -> autenticação (popula req.user) -> autorização por
    // permissão -> CSRF (para métodos que alteram estado).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
