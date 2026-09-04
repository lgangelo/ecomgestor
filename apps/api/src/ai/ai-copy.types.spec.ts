import { buildProductCopyPrompt, PRODUCT_COPY_SCHEMA } from './ai-copy.types';

describe('buildProductCopyPrompt', () => {
  it('inclui os atributos e hints fornecidos, e nunca instrui a copiar o título de partida literal', () => {
    const prompt = buildProductCopyPrompt({
      titleHint: 'Bolsa média',
      descriptionHint: 'Bolsa média com alça de corrente',
      category: 'Bolsas',
      color: 'Dourado',
      size: 'M',
      brand: 'Venticelli',
    });

    expect(prompt).toContain('Bolsa média');
    expect(prompt).toContain('Categoria: Bolsas');
    expect(prompt).toContain('Marca: Venticelli');
    expect(prompt).toContain('Cor: Dourado');
    expect(prompt).toContain('Tamanho: M');
    expect(prompt).toMatch(/NUNCA copiar literal/);
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
});

describe('PRODUCT_COPY_SCHEMA', () => {
  it('rejeita uma resposta sem title/description (guarda contra provedor que não força schema)', () => {
    expect(PRODUCT_COPY_SCHEMA.safeParse({ title: 'X' }).success).toBe(false);
    expect(PRODUCT_COPY_SCHEMA.safeParse({ title: 'X', description: 'Y' }).success).toBe(true);
  });
});
