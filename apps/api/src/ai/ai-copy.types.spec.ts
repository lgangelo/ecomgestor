import { buildProductCopyPrompt, enforceTitleLimit, MAX_TITLE_LENGTH, PRODUCT_COPY_SCHEMA } from './ai-copy.types';

describe('buildProductCopyPrompt', () => {
  it('inclui os atributos e hints fornecidos, e nunca instrui a copiar o título de partida literal', () => {
    const prompt = buildProductCopyPrompt({
      titleHint: 'Bolsa média',
      descriptionHint: 'Bolsa média com alça de corrente',
      category: 'Bolsas',
      color: 'Dourado, Preto',
      size: 'M',
      brand: 'Venticelli',
    });

    expect(prompt).toContain('Bolsa média');
    expect(prompt).toContain('Categoria: Bolsas');
    expect(prompt).toContain('Marca: Venticelli');
    expect(prompt).toContain('Dourado, Preto');
    expect(prompt).toContain('Tamanho: M');
    expect(prompt).toMatch(/NUNCA copiar literal/);
  });

  it('nunca deixa a IA comprometer o texto com uma cor específica, com ou sem lista de cores', () => {
    const withColor = buildProductCopyPrompt({ titleHint: 'Bolsa média', color: 'Dourado, Preto' });
    const withoutColor = buildProductCopyPrompt({ titleHint: 'Bolsa média' });

    expect(withColor).toMatch(/NUNCA citar uma cor específica/);
    expect(withColor).toMatch(/SEM\s*\nmencionar uma cor específica|SEM mencionar uma cor específica/);
    expect(withoutColor).toMatch(/SEM\s*\nmencionar uma cor específica|SEM mencionar uma cor específica/);
  });

  it('limita o título ao tamanho do marketplace mais restritivo (Mercado Livre) e exige descrição em blocos', () => {
    const prompt = buildProductCopyPrompt({ titleHint: 'Bolsa média' });

    expect(prompt).toContain(`até ${MAX_TITLE_LENGTH} caracteres`);
    expect(prompt).toMatch(/Mercado Livre, o mais restritivo/);
    expect(prompt).toMatch(/NUNCA um único parágrafo corrido/);
    expect(prompt).toMatch(/chamada pra ação/);
  });

  it('avisa explicitamente para nunca inventar detalhes visuais quando não há foto', () => {
    const prompt = buildProductCopyPrompt({ titleHint: 'Bolsa média' });
    expect(prompt).toMatch(/nenhuma foto foi anexada/i);
    expect(prompt).toMatch(/sem inventar detalhes visuais/i);
  });

  it('instrui a basear a descrição na foto real quando uma imagem é anexada', () => {
    const prompt = buildProductCopyPrompt({ titleHint: 'Bolsa média', image: { base64: 'abc', mimeType: 'image/jpeg' } });
    expect(prompt).toMatch(/foto real do produto foi anexada/i);
  });

  it(
    'PEDIDO DO USUÁRIO: exige os 3 blocos da descrição mesmo com poucas informações fornecidas ' +
      '(achado real: descrição gerada com pouco preenchimento saiu curta/genérica demais)',
    () => {
      const semNadaPreenchido = buildProductCopyPrompt({ titleHint: 'Bolsa média' });
      expect(semNadaPreenchido).toMatch(/sempre obrigatórios/i);
      expect(semNadaPreenchido).toMatch(/nunca devolva uma descrição de uma linha só ou um resumo genérico curto/i);
    },
  );

  it('destaca courvim e acabamento premium só quando a marca é Venticelli', () => {
    const venticelli = buildProductCopyPrompt({ titleHint: 'Bolsa média', brand: 'Venticelli' });
    const outraMarca = buildProductCopyPrompt({ titleHint: 'Bolsa média', brand: 'Outra Marca' });

    expect(venticelli).toMatch(/courvim/i);
    expect(venticelli).toMatch(/bolsas de luxo/i);
    expect(outraMarca).not.toMatch(/courvim/i);
  });
});

describe('enforceTitleLimit', () => {
  it('mantém títulos dentro do limite inalterados', () => {
    expect(enforceTitleLimit('Bolsa Feminina De Ombro Couro')).toBe('Bolsa Feminina De Ombro Couro');
  });

  it('corta títulos maiores que o limite numa fronteira de palavra, nunca no meio dela', () => {
    const long = 'Bolsa Feminina De Ombro Grande Off White Couro Texturizado Barbicacho Premium Elegante';
    const result = enforceTitleLimit(long);

    expect(result.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(long.startsWith(result)).toBe(true);
    expect(long[result.length]).not.toMatch(/\S/);
  });
});

describe('PRODUCT_COPY_SCHEMA', () => {
  it('rejeita uma resposta sem title/description (guarda contra provedor que não força schema)', () => {
    expect(PRODUCT_COPY_SCHEMA.safeParse({ title: 'X' }).success).toBe(false);
    expect(PRODUCT_COPY_SCHEMA.safeParse({ title: 'X', description: 'Y' }).success).toBe(true);
  });
});
