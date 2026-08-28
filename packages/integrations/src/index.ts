/**
 * Contrato para conectores de marketplace. Nesta primeira etapa nenhum conector é
 * implementado de fato — apenas a interface que os módulos reais (TikTok Shop, Shopee,
 * Mercado Livre) irão implementar em etapas futuras.
 */
export type MarketplaceProvider = 'TIKTOK_SHOP' | 'SHOPEE' | 'MERCADO_LIVRE';

export interface MarketplaceConnectionStatus {
  provider: MarketplaceProvider;
  connected: boolean;
  storeName?: string;
  lastSyncAt?: Date;
}

export interface MarketplaceConnector {
  provider: MarketplaceProvider;
  connect(companyId: string): Promise<MarketplaceConnectionStatus>;
  disconnect(companyId: string): Promise<void>;
  syncNow(companyId: string): Promise<void>;
}

/** Placeholder: nenhum conector real é registrado nesta etapa. */
export const AVAILABLE_CONNECTORS: MarketplaceConnector[] = [];
