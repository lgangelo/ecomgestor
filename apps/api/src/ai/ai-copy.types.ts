import { z } from 'zod';

export interface GenerateProductCopyInput {
  /** Título curto que o vendedor já tem em mente (ex.: "Bolsa média") — ponto de partida, nunca
   * o texto final: a IA deve expandir, não só repetir. */
  titleHint?: string;
  descriptionHint?: string;
  category?: string;
  /** Cores das variações já cadastradas do produto (ex.: "Preto, Dourado, Off White") — serve só
   * de CONTEXTO pra IA nunca comprometer o texto com uma cor específica: cor é atributo de cada
   * variação (SKU), não do produto como um todo, então título/descrição nunca devem citá-la. */
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

/** Schema de saída compartilhado pelos três provedores — a Anthropic valida contra ele
 * nativamente (`output_config.format`); OpenAI e Gemini (sem enforcement estrito de schema nos
 * seus respectivos modos JSON) validam o JSON devolvido contra o MESMO schema depois de parsear,
 * nunca confiam cegamente no texto. */
export const PRODUCT_COPY_SCHEMA = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

/** Mercado Livre é o mais restritivo dos três marketplaces integrados (60 caracteres no título);
 * Shopee aceita até 256 e TikTok Shop bem mais que isso. Usamos o menor denominador comum pra um
 * título gerado por IA nunca precisar ser cortado/rejeitado numa sincronização futura, seja qual
 * for o canal de destino do produto. */
export const MAX_TITLE_LENGTH = 60;

/**
 * Rede de segurança pro caso do modelo ignorar a instrução de tamanho do prompt e devolver um
 * título mais longo — corta sempre numa fronteira de palavra, nunca no meio de uma palavra.
 */
export function enforceTitleLimit(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
  const cut = trimmed.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Prompt compartilhado pelos três provedores — nunca duplicado com pequenas divergências entre
 * Anthropic/OpenAI/Gemini, que fariam os três produzirem qualidade/formato diferentes pro mesmo
 * pedido.
 */
export function buildProductCopyPrompt(input: GenerateProductCopyInput): string {
  const facts: string[] = [];
  if (input.titleHint) facts.push(`Título de partida (rascunho do vendedor, NUNCA copiar literal — expandir): "${input.titleHint}"`);
  if (input.descriptionHint) facts.push(`Descrição de partida (rascunho do vendedor): "${input.descriptionHint}"`);
  if (input.category) facts.push(`Categoria: ${input.category}`);
  if (input.brand) {
    facts.push(`Marca: ${input.brand}`);
    // Fato conhecido do catálogo (não é invenção a partir da foto): a linha Venticelli é
    // majoritariamente bolsas de luxo em courvim (couro sintético) com acabamento premium — vale
    // destacar isso sempre que coerente com o produto, mesmo que a foto não deixe o material óbvio.
    if (input.brand.toLowerCase().includes('venticelli')) {
      facts.push(
        'Contexto da marca: bolsas de luxo, confeccionadas em courvim (couro sintético) com acabamento premium'
          + ' — destaque esse material e esse padrão de acabamento sempre que for coerente com o produto.',
      );
    }
  }
  if (input.color) {
    facts.push(
      `Cores disponíveis nas variações (contexto apenas — NUNCA citar uma cor específica no título/descrição): ${input.color}`,
    );
  }
  if (input.size) facts.push(`Tamanho: ${input.size}`);

  return [
    'Você é um especialista em SEO para marketplaces e copywriting de alta conversão, com foco em TikTok Shop,',
    'Shopee e Mercado Livre. Quando houver foto, identifique material, estilo, acabamento, compartimentos/',
    'fechamentos e diferenciais visíveis, e combine isso com as informações fornecidas abaixo pra gerar um título e',
    'uma descrição pensados pra BUSCA: o comprador encontra o produto digitando palavras-chave reais (tipo de',
    'item, material, uso, ocasião), então essas palavras precisam aparecer de forma natural ao longo do texto,',
    'nunca como lista solta — nunca invente especificação que não seja visível na imagem ou informada abaixo.',
    `\nTÍTULO: até ${MAX_TITLE_LENGTH} caracteres — limite do Mercado Livre, o mais restritivo dos três`,
    'marketplaces (nunca ultrapasse isso mesmo sabendo que Shopee/TikTok Shop aceitam títulos bem mais longos, pra',
    'nunca quebrar uma sincronização futura). Palavras-chave relevantes primeiro, sem emojis, sem exagero, e SEM',
    'mencionar uma cor específica — cor é atributo de cada variação (SKU), não do produto como um todo.',
    '\nDESCRIÇÃO: formatada em blocos com quebras de linha reais entre eles — NUNCA um único parágrafo corrido:',
    '1) um parágrafo de abertura (1-2 frases) destacando o principal benefício e a ocasião de uso;',
    '2) uma lista de características técnicas visíveis ou informadas, uma por linha, cada linha começando com',
    '   "• " (material, fechamento, alças/compartimentos, acabamento — nunca invente o que não for visível/',
    '   informado);',
    '3) uma última linha com uma chamada pra ação (CTA) direta.',
    'Nenhum desses blocos deve mencionar uma cor específica do produto, pelo mesmo motivo do título.',
    '\nOs 3 blocos acima da descrição são SEMPRE obrigatórios, mesmo quando as informações fornecidas abaixo',
    'forem poucas ou nenhuma — nunca devolva uma descrição de uma linha só ou um resumo genérico curto. Com',
    'poucos dados, use o próprio tipo de produto e o contexto de marca/categoria como base pra benefícios',
    'plausíveis e verdadeiros desse tipo de item (praticidade, versatilidade, uso no dia a dia/trabalho/viagem),',
    'sem inventar especificação técnica, material ou detalhe visual que não tenha sido informado.',
    facts.length > 0 ? `\nInformações fornecidas sobre o produto:\n${facts.map((f) => `- ${f}`).join('\n')}` : '',
    input.image
      ? '\nUma foto real do produto foi anexada — baseie material, formato e demais detalhes visíveis NELA, mas'
        + ' nunca cite a cor mostrada nela (mesma regra acima) nem invente características que não aparecem na'
        + ' imagem.'
      : '\nNenhuma foto foi anexada — baseie-se só no texto fornecido, sem inventar detalhes visuais.',
    '\nResponda em português do Brasil, em tom elegante, sofisticado e de venda direto — adequado ao público',
    'predominantemente feminino da loja — sem exagero nem promessas que a foto/descrição não sustentam.',
  ]
    .filter(Boolean)
    .join('\n');
}
