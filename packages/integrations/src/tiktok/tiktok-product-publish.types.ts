/**
 * Tipos do fluxo de PUBLICAÇÃO de produto na TikTok Shop (Create/Partial Edit Product) — pedido
 * do usuário: produtos agora nascem só na nossa plataforma e são enviados pra TikTok Shop, Mercado
 * Livre e Shopee automaticamente. Confirmados via documentação oficial navegada diretamente em
 * partner.tiktokshop.com/docv2 (não é fetch simples — SPA renderizada via JS). Separado de
 * `tiktok.types.ts` (que é sobre autenticação/hosts/paths) porque este arquivo é só sobre o
 * payload de negócio de produto.
 *
 * ATENÇÃO: nada aqui foi confirmado contra uma chamada REAL de criação nesta conta ainda — só
 * contra a documentação. Os tipos primitivos de `amount`/`quantity` (string vs number) NÃO
 * apareceram num exemplo de payload completo na doc (o exemplo de curl foi cortado pelo próprio
 * site antes de chegar em `inventory`/`price`) — assumidos como `string` pela convenção mais
 * comum entre APIs de e-commerce (evita erro de arredondamento de float), mas isso precisa ser
 * confirmado contra o primeiro erro de validação real, igual todo o resto desta integração.
 */

export interface TikTokUploadedImage {
  uri: string;
  url: string;
  width: number;
  height: number;
  useCase: string;
}

export type TikTokImageUseCase =
  | 'MAIN_IMAGE'
  | 'ATTRIBUTE_IMAGE'
  | 'DESCRIPTION_IMAGE'
  | 'CERTIFICATION_IMAGE'
  | 'SIZE_CHART_IMAGE'
  | 'CUSTOMIZATION_IMAGE';

export interface TikTokCategory {
  id: string;
  parentId: string;
  localName: string;
  isLeaf: boolean;
}

export interface TikTokCategoryAttributeValue {
  id: string;
  name: string;
}

/** "Get Attributes" — equivalente ao `getCategoryAttributes` do Mercado Livre. ACHADO REAL da
 * doc oficial (exemplo de resposta reproduzido literalmente): a própria TikTok escreve
 * `is_requried` (com erro de digitação) no JSON de verdade — por isso `isRequired` aqui é
 * resolvido aceitando as duas grafias, nunca confiando só na correta. */
export interface TikTokCategoryAttribute {
  id: string;
  name: string;
  type: string;
  isRequired: boolean;
  isCustomizable: boolean;
  values?: TikTokCategoryAttributeValue[];
}

export interface TikTokWarehouse {
  id: string;
  name: string;
}

export interface TikTokCreateProductSkuAttribute {
  /** id do valor built-in do catálogo (Get Attributes) — junto com `id` do atributo. */
  id?: string;
  value_id?: string;
  /** nome customizado (atributo/valor que não existe no catálogo built-in) — só permitido quando
   * `is_customizable` do atributo é true (Get Attributes). */
  name?: string;
  value_name?: string;
  /** Só pode ser anexada a 1 tipo de atributo por produto (o "principal", tipicamente cor) — uma
   * imagem por VALOR desse atributo (2 cores = 2 SKUs com sku_img diferente, mesmo atributo). */
  sku_img?: { uri: string };
}

export interface TikTokCreateProductSkuInventory {
  warehouse_id: string;
  quantity: number;
}

export interface TikTokCreateProductSkuPrice {
  amount: string;
  currency: string;
}

export interface TikTokCreateProductSku {
  sales_attributes?: TikTokCreateProductSkuAttribute[];
  inventory: TikTokCreateProductSkuInventory[];
  price: TikTokCreateProductSkuPrice;
  seller_sku?: string;
}

export interface TikTokCreateProductAttributeValue {
  id?: string;
  name?: string;
}

export interface TikTokCreateProductAttribute {
  id: string;
  values: TikTokCreateProductAttributeValue[];
}

export interface TikTokCreateProductInput {
  /** `AS_DRAFT` cria sem publicar de verdade; default (omitido) é `LISTING` (publica). */
  save_mode?: 'AS_DRAFT' | 'LISTING';
  title: string;
  /** HTML, máx. 10.000 caracteres — diferente do Mercado Livre, que exige texto PLANO. Nunca
   * reaproveitar a mesma limpeza (`stripHtmlForPlainText`) usada lá. */
  description: string;
  category_id: string;
  /** `v2` obrigatório em US/EU/SEA (árvore de 7 níveis); `v1` nas demais regiões, inclusive BR
   * (não confirmado contra a conta real ainda — Get Categories decide isso). */
  category_version?: 'v1' | 'v2';
  brand_id?: string;
  main_images: Array<{ uri: string }>;
  skus: TikTokCreateProductSku[];
  product_attributes?: TikTokCreateProductAttribute[];
  package_dimensions?: { length: string; width: string; height: string; unit: string };
  package_weight?: { value: string; unit: string };
  /** `id`/uri devolvido pelo Upload Product File — formato exato da resposta desse endpoint
   * ainda NÃO confirmado (ver `TikTokClient.uploadProductFile`), então este campo não deve ser
   * usado em produção até essa confirmação acontecer. */
  video?: { id: string };
}
