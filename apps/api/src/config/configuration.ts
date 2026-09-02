export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  webAppUrl: string;
  cookieDomain?: string;
  cookieSecure: boolean;
  fiscalXmlStorageDir: string;
  /** Seção 19 da Fase 4 — REFERENCE_ONLY (default) nunca grava o XML em disco, só a referência
   * fiscal; PERSIST é o comportamento legado (Fase 2), mantido só por compatibilidade. */
  xmlStorageMode: 'REFERENCE_ONLY' | 'PERSIST';
  integrationSecretsKey: string;
  tiktok: {
    enabled: boolean;
    appKey: string;
    appSecret: string;
    /** Identificador separado do App Key — ver comentário em buildAuthorizeUrl. */
    serviceId: string;
    redirectUri: string;
    inventoryPushEnabled: boolean;
    reconcileIntervalMinutes: number;
    financeSyncIntervalMinutes: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  webAppUrl: process.env.WEB_APP_URL ?? 'http://localhost:3000',
  cookieDomain: process.env.COOKIE_DOMAIN,
  // Default: Secure sempre que NODE_ENV=production (comportamento de sempre). COOKIE_SECURE=false
  // só existe para testar em HTTP puro sem TLS (ex.: acesso direto por IP, sem Traefik/domínio
  // ainda) — nunca usar isso com tráfego real saindo para a internet.
  cookieSecure: process.env.COOKIE_SECURE === 'false' ? false : process.env.NODE_ENV === 'production',
  // Em produção (Docker) deve apontar para um volume persistente — ver docker-compose.yml.
  fiscalXmlStorageDir: process.env.FISCAL_XML_STORAGE_DIR ?? './storage/fiscal-xml',
  xmlStorageMode: process.env.XML_STORAGE_MODE === 'PERSIST' ? 'PERSIST' : 'REFERENCE_ONLY',
  // Chave de derivação para criptografar credenciais de integração em repouso (seção 5 da
  // Fase 3). Nunca reutiliza os segredos de JWT — comprometer um não deve comprometer o outro.
  integrationSecretsKey:
    process.env.INTEGRATION_SECRETS_KEY ?? 'CHANGE_ME_INTEGRATION_SECRETS_KEY_DEV_ONLY',
  tiktok: {
    enabled: Boolean(process.env.TIKTOK_APP_KEY && process.env.TIKTOK_APP_SECRET),
    appKey: process.env.TIKTOK_APP_KEY ?? '',
    appSecret: process.env.TIKTOK_APP_SECRET ?? '',
    serviceId: process.env.TIKTOK_SERVICE_ID ?? '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI ?? '',
    // Seção 38-39: por padrão NUNCA sincroniza estoque automaticamente para a TikTok —
    // apenas compara. Habilitar exige decisão explícita do operador via variável de ambiente.
    inventoryPushEnabled: process.env.TIKTOK_INVENTORY_PUSH_ENABLED === 'true',
    reconcileIntervalMinutes: parseInt(process.env.TIKTOK_RECONCILE_INTERVAL_MINUTES ?? '15', 10),
    // Liquidação/extrato da TikTok é diário, não faz sentido checar com a mesma frequência da
    // reconciliação de pedidos — 60 min por padrão é suficiente pra "taxas da plataforma"
    // aparecer no mesmo dia em que o pedido é liquidado, sem gerar chamada excessiva à API.
    financeSyncIntervalMinutes: parseInt(process.env.TIKTOK_FINANCE_SYNC_INTERVAL_MINUTES ?? '60', 10),
  },
});
