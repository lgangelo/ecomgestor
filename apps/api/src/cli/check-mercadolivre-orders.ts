/* eslint-disable no-console */
/**
 * Script de DIAGNÓSTICO (só leitura, nunca cria/modifica nada em produção) pra confirmar o
 * formato real da Orders API do Mercado Livre contra a conta já conectada — ver
 * docs/integrations/mercado-livre.md, seção 4 ("Orders API"), que documentava só
 * `GET /orders/{id}`/`GET /orders/search` existindo, sem parâmetros/resposta/enum de status
 * confirmados (fetch direto da doc oficial bloqueado com 403 durante a pesquisa original).
 *
 * O que faz, nesta ordem:
 *   1. `GET /orders/search?seller=<user_id>` — confirma paginação e formato da lista.
 *   2. Pra cada pedido encontrado (até um limite), `GET /orders/{id}` — imprime o JSON completo
 *      (nunca resumido) pra inspecionar status, itens, payments[]/sale_fee, comprador, frete.
 *   3. Se o pedido trouxer um `shipping.id`, tenta `GET /shipments/{id}` também.
 *
 * NUNCA chama POST/PUT/DELETE — só GET. Não escreve nada no banco (nenhuma tabela `Order`).
 *
 * IMPORTANTE (2026-09-04): rodado a partir do ambiente sandbox usado pra escrever este script,
 * toda chamada (`/orders/search`, `/orders/{id}`, e até `/users/me`/`/items/{id}`/`/shipments/{id}`
 * com um Bearer qualquer) voltou HTTP 403 `PA_UNAUTHORIZED_RESULT_FROM_POLICIES` — um bloqueio de
 * rede/IP do próprio Mercado Livre (edge PolicyAgent, ANTES de validar o token — confirmado
 * trocando o Bearer real por um valor inventado e recebendo o mesmo erro), não um problema de
 * credencial. `/categories/{id}` (sem auth) respondeu 200 normalmente da mesma máquina, então não
 * é um bloqueio geral do domínio, só de endpoints que normalmente exigem sessão/token. Isso NÃO
 * foi resolvido nesta sessão — rodar este script a partir de um ambiente sem esse bloqueio (ex.:
 * a VM de produção, de onde `publish-mercadolivre-item.ts` já funcionou de verdade antes) é
 * necessário antes de confiar em qualquer resultado impresso por ele.
 *
 * Uso:
 *   npm run check-mercadolivre-orders -- [limit] [offset] [status]
 *   (status opcional filtra `/orders/search` por order.status, ex.: paid, cancelled)
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';
import { MercadoLivreCredentialsService } from '../integrations/mercadolivre/mercadolivre-credentials.service';

async function main() {
  const limit = process.argv[2] ?? '10';
  const offset = process.argv[3] ?? '0';
  const statusFilter = process.argv[4];

  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  await prisma.$disconnect();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const connectorFactory = app.get(MercadoLivreConnectorFactory);
    const credentialsService = app.get(MercadoLivreCredentialsService);
    const { client, integrationId } = await connectorFactory.forCompany(company.id);

    const credentials = await credentialsService.getCredentials(integrationId);
    if (!credentials) {
      console.error('Credenciais Mercado Livre não encontradas pra essa empresa.');
      process.exitCode = 1;
      return;
    }
    const sellerId = credentials.userId;
    console.log(`Usando seller/user_id conectado: ${sellerId}`);

    // 1. GET /orders/search --------------------------------------------------
    const query: Record<string, string> = { seller: sellerId, limit, offset };
    if (statusFilter) query['order.status'] = statusFilter;

    console.log('======================================================');
    console.log(`GET /orders/search com query: ${JSON.stringify(query)}`);
    console.log('======================================================');
    const searchResult = await client.searchOrders(query);
    console.log(JSON.stringify(searchResult, null, 2));

    const results = Array.isArray((searchResult as any).results) ? ((searchResult as any).results as any[]) : [];
    console.log(`\nTotal de pedidos retornados nesta página: ${results.length}`);
    if ((searchResult as any).paging) {
      console.log(`Paging: ${JSON.stringify((searchResult as any).paging)}`);
    }

    if (results.length === 0) {
      console.log('Nenhum pedido encontrado — nada mais a inspecionar.');
      return;
    }

    // Reúne até 3 ids distintos, preferindo status diferentes entre si quando possível.
    const seenStatuses = new Set<string>();
    const chosen: any[] = [];
    for (const r of results) {
      const status = r?.status ?? r?.order_status ?? 'desconhecido';
      if (chosen.length < 3 && (!seenStatuses.has(status) || chosen.length < results.length)) {
        if (!seenStatuses.has(status) || chosen.length < 3) {
          chosen.push(r);
          seenStatuses.add(status);
        }
      }
      if (chosen.length >= 3) break;
    }
    const idsToFetch = chosen.length > 0 ? chosen : results.slice(0, 3);

    // 2. GET /orders/{id} pra cada um -----------------------------------------
    const shipmentIdsToTry: string[] = [];
    for (const item of idsToFetch) {
      const orderId = item.id ?? item.order_id;
      if (!orderId) continue;
      console.log('\n======================================================');
      console.log(`GET /orders/${orderId}`);
      console.log('======================================================');
      try {
        const order = await client.getOrder(String(orderId));
        console.log(JSON.stringify(order, null, 2));

        const shipping = (order as any).shipping;
        const shipmentId = shipping?.id;
        if (shipmentId) {
          shipmentIdsToTry.push(String(shipmentId));
        }
      } catch (err: any) {
        console.error(`Erro ao buscar pedido ${orderId}:`, err.message ?? err);
      }
    }

    // 3. GET /shipments/{id} pros envios encontrados --------------------------
    for (const shipmentId of shipmentIdsToTry.slice(0, 3)) {
      console.log('\n======================================================');
      console.log(`GET /shipments/${shipmentId}`);
      console.log('======================================================');
      try {
        const shipment = await client.getShipment(shipmentId);
        console.log(JSON.stringify(shipment, null, 2));
      } catch (err: any) {
        console.error(`Erro ao buscar envio ${shipmentId}:`, err.message ?? err);
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
