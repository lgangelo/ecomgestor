import { BadGatewayException } from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { AiCopyProvider, buildProductCopyPrompt, GenerateProductCopyInput, GenerateProductCopyOutput, PRODUCT_COPY_SCHEMA } from './ai-copy.types';

/**
 * Provedor Gemini (Google AI Studio) — opção gratuita em baixa escala (chave sem cartão de
 * crédito, cota diária generosa). Mesmo padrão dos outros dois provedores: pede JSON estruturado
 * (`responseMimeType` + `responseSchema`, confirmados contra os tipos reais do pacote
 * `@google/genai` instalado — nunca supostos de memória) e ainda assim valida a saída contra
 * `PRODUCT_COPY_SCHEMA` depois de parsear, nunca confiando cegamente no texto devolvido.
 */
export class GeminiCopyProvider implements AiCopyProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateProductCopy(input: GenerateProductCopyInput): Promise<GenerateProductCopyOutput> {
    const client = new GoogleGenAI({ apiKey: this.apiKey });

    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
    if (input.image) {
      parts.push({ inlineData: { data: input.image.base64, mimeType: input.image.mimeType } });
    }
    parts.push({ text: buildProductCopyPrompt(input) });

    let raw: string | undefined;
    try {
      const response = await client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ['title', 'description'],
          },
        },
      });
      raw = response.text;
    } catch (error) {
      throw new BadGatewayException(`Falha ao gerar título/descrição via Gemini: ${(error as Error).message}`);
    }

    if (!raw) {
      throw new BadGatewayException('O Gemini não devolveu conteúdo.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadGatewayException('O Gemini devolveu um JSON inválido.');
    }

    const result = PRODUCT_COPY_SCHEMA.safeParse(parsed);
    if (!result.success) {
      throw new BadGatewayException('O Gemini devolveu um formato inesperado (sem title/description).');
    }
    return result.data;
  }
}
