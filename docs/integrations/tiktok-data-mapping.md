# TikTok Shop — mapeamento de dados (seção 61)

Este documento existe para que nenhum módulo genérico do domínio precise conhecer o formato de
payload da TikTok Shop. Todo dado externo passa pelo `TikTokMapper`
(`packages/integrations/src/tiktok/tiktok.mapper.ts`) antes de chegar a qualquer service de
domínio — nunca o inverso.

```text
payload TikTok  ->  TikTokMapper  ->  DTO normalizado (ExternalOrder / ExternalProduct / ...)
                                          |
                                          v
                                   Services de domínio (OrdersService, InventoryLedgerService...)
```

## Campos — produto

| Campo TikTok (raw)                | Campo interno normalizado (`ExternalProduct`) |
| ---------------------------------- | ---------------------------------------------- |
| `product_id`                       | `externalProductId`                            |
| `skus[].id`                        | `externalSku`                                  |
| `skus[].seller_sku`                | usado para o match automático seguro (seção 11), não persistido como campo próprio |
| `product_name` / `title`           | `name`                                          |
| `price.sale_price`                 | `price` (string decimal, nunca float)          |
| `skus[].inventory[].quantity`      | `stock`                                        |
| payload completo                   | `raw` (apenas para depuração; nunca exibido cru no frontend) |

## Campos — pedido

| Campo TikTok (raw)             | Campo interno normalizado (`ExternalOrder` / `ExternalOrderNormalized`) |
| ------------------------------- | ------------------------------------------------------------------------ |
| `order_id`                      | `externalOrderId`                                                        |
| `status`                        | `externalStatus` (string bruta, preservada) — **nunca** vira nome de status interno diretamente |
| `create_time`                   | `orderedAt`                                                              |
| `paid_time`                     | `paidAt`                                                                 |
| `line_items[].sku_id`           | `items[].externalSku`                                                    |
| `line_items[].sale_price`       | `items[].unitPrice`                                                      |
| `line_items[].seller_discount`  | `items[].sellerDiscount`                                                 |
| `line_items[].platform_discount`| `items[].platformDiscount`                                               |
| `payment.shipping_fee`          | `amounts.shippingRevenue`                                                |
| `payment.seller_shipping_fee`   | `amounts.shippingCost`                                                   |
| `payment.platform_fee` / `commission` | `amounts.marketplaceFee`                                           |
| payload completo                | `raw`                                                                    |

## Mapeamento de status — TikTok → `OrderStatus` interno

Centralizado em `tiktok.mapper.ts::mapOrderStatus`. A tabela abaixo é a **única** fonte de
verdade desse mapeamento — a máquina de estados interna (`order-state-machine.ts`) nunca foi
alterada para acomodar nomenclatura da TikTok, conforme exigido na seção 16 do pedido.

| Status TikTok (`externalStatus`) | `OrderStatus` interno   | Observação |
| ---------------------------------- | ------------------------ | ---------- |
| `UNPAID`                           | `CREATED`                 |            |
| `ON_HOLD` / `AWAITING_SHIPMENT`     | `PAID`                    | Pagamento confirmado, ainda não separado para envio |
| `AWAITING_COLLECTION`               | `PROCESSING`              |            |
| `PARTIALLY_SHIPPING` / `PACKAGE_READY_TO_SHIP` | `READY_TO_SHIP`  |            |
| `IN_TRANSIT` / `SHIPPED`            | `SHIPPED`                 |            |
| `DELIVERED` / `COMPLETED`           | `DELIVERED`               |            |
| `CANCELLED`                        | `CANCELLED`               |            |
| `PARTIAL_RETURN` / `RETURN_APPLIED` / `IN_RETURN` | `RETURN_REQUESTED` |     |

Qualquer status TikTok fora desta tabela nunca é adivinhado: o pedido é criado/atualizado com
`externalStatus` preenchido e `internalStatus` mantido no último status interno válido conhecido,
e um erro operacional é registrado (`integrationIssue`) para revisão manual — nunca uma
transição interna é forçada a partir de um status desconhecido.

## Mapeamento — Finance / Settlement

A Finance API da TikTok não documenta categorias fixas iguais às nossas — por isso o mapper
normaliza apenas o que a documentação efetivamente confirma (ver `docs/integrations/tiktok.md`,
item 11–15), sem inventar categorias:

| Categoria bruta observada na Finance API | `SettlementTransaction.type` interno |
| ------------------------------------------ | -------------------------------------- |
| valor bruto do pedido (`order_amount`)      | `GROSS_SALE`                           |
| desconto do vendedor                        | `SELLER_DISCOUNT`                      |
| desconto/subsídio da plataforma              | `PLATFORM_DISCOUNT`                    |
| taxa/comissão da plataforma                  | `PLATFORM_FEE`                         |
| ajuste de frete                              | `SHIPPING_ADJUSTMENT`                  |
| comissão de afiliado                         | `AFFILIATE_COMMISSION`                 |
| repasse liquidado (`payment`/`settlement`)   | `SETTLEMENT_PAYOUT`                    |

Qualquer categoria bruta não reconhecida cai em `OTHER` com o valor original preservado em
`rawType` — nunca é descartada silenciosamente.

## Documentos fiscais — por que não há mapeamento de "download de XML"

Conforme concluído na pesquisa (`docs/integrations/tiktok.md`, item 19), a TikTok Shop não emite
nem disponibiliza XML de NF-e para download — é o seller quem sobe o XML gerado por seu próprio
sistema fiscal. Portanto não existe, e não foi criado, um `TikTokFiscalProvider` de download; o
`ManualFiscalProvider` da Fase 2 continua sendo o único fluxo fiscal, para todos os canais.
