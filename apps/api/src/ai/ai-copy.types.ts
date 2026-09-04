import { z } from 'zod';

export interface GenerateProductCopyInput {
  /** Título curto que o vendedor já tem em mente (ex.: "Bolsa média") — ponto de partida, nunca
   * o texto final: a IA deve expandir, não só repetir. */
  titleHint?: string;
  descriptionHint?: string;
  category?: string;
  color?: string;
  size?: string;
  brand?: string;
  image?: { base64: string; mimeType: string };
}

export interface GenerateProductCopyOutput {
  title: string;
  description: string;
}

export interface AiCopyProvider {
  generateProductCopy(input: GenerateProductCopyInput): Promise<GenerateProductCopyOutput>;
}

/** Schema de saída compartilhado pelos dois provedores — a Anthropic valida contra ele nativamente
 * (`output_config.format`); a OpenAI (sem enforcement de schema no modo `json_object`) valida o
 * JSON devolvido contra o MESMO schema depois de parsear, nunca confia cegamente no texto. */
export const PRODUCT_COPY_SCHEMA = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

/**
 * Prompt compartilhado pelos dois provedores — nunca duplicado com pequenas divergências entre
 * Anthropic/OpenAI, que fariam os dois provedores produzirem qualidade/formato diferentes pro
 * mesmo pedido.
 */
export function buildProductCopyPrompt(input: GenerateProductCopyInput): string {
  const facts: string[] = [];
  if (input.titleHint) facts.push(`Título de partida (rascunho do vendedor, NUNCA copiar literal — expandir): "${input.titleHint}"`);
  if (input.descriptionHint) facts.push(`Descrição de partida (rascunho do vendedor): "${input.descriptionHint}"`);
  if (input.category) facts.push(`Categoria: ${input.category}`);
  if (input.brand) facts.push(`Marca: ${input.brand}`);
  if (input.color) facts.push(`Cor: ${input.color}`);
  if (input.size) facts.push(`Tamanho: ${input.size}`);

  return [
    'Você é um redator especializado em anúncios de e-commerce brasileiro (marketplace: TikTok Shop/Shopee/loja própria).',
    'Gere um TÍTULO (até 100 caracteres, rico em palavras-chave de busca, sem emojis) e uma DESCRIÇÃO',
    '(2 a 4 frases corridas, destacando material, uso e diferenciais) para o produto abaixo.',
    facts.length > 0 ? `\nInformações fornecidas:\n${facts.map((f) => `- ${f}`).join('\n')}` : '',
    input.image
      ? '\nUma foto real do produto foi anexada — baseie cor, material e detalhes visuais NELA, nunca invente características que não aparecem na imagem.'
      : '\nNenhuma foto foi anexada — baseie-se só no texto fornecido, sem inventar detalhes visuais.',
    '\nResponda em português do Brasil, em tom de venda direto, sem exagero nem promessas que a foto/descrição não sustentam.',
  ]
    .filter(Boolean)
    .join('\n');
}
