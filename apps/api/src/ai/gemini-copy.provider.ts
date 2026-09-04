import { BadGatewayException } from '@nestjs/common';
import { ApiError, GoogleGenAI, Type } from '@google/genai';
import {
  AiCopyProvider,
  buildProductCopyPrompt,
  enforceTitleLimit,
  GenerateProductCopyInput,
  GenerateProductCopyOutput,
  PRODUCT_COPY_SCHEMA,
} from './ai-copy.types';

/** Confirmado em produção: a camada gratuita do Gemini devolve 503 ("high demand") com alguma
 * frequência — transitório, quase sempre some numa segunda tentativa alguns segundos depois.
 * Nunca reage a 4xx (chave inválida, modelo não encontrado, etc.) — isso é erro de configuração,
 * tentar de novo nunca resolveria. */
const RETRYABLE_STATUS_CODES = new Set([429, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      raw = await this.callWithRetry(client, parts);
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
    return { title: enforceTitleLimit(result.data.title), description: result.data.description };
  }

  private async callWithRetry(
    client: GoogleGenAI,
    parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>,
  ): Promise<string | undefined> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
        return response.text;
      } catch (error) {
        const retryable = error instanceof ApiError && RETRYABLE_STATUS_CODES.has(error.status);
        if (!retryable || attempt === MAX_ATTEMPTS) throw error;
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
    return undefined;
  }
}
