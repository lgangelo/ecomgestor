import { BadGatewayException } from '@nestjs/common';
import OpenAI from 'openai';
import { AiCopyProvider, buildProductCopyPrompt, GenerateProductCopyInput, GenerateProductCopyOutput, PRODUCT_COPY_SCHEMA } from './ai-copy.types';

/**
 * Provedor OpenAI (alternativa neutra à Anthropic) — usa a Chat Completions API com visão
 * (`image_url` em base64) e `response_format: json_object`. Diferente do provedor Anthropic
 * (que valida a saída contra um schema nativamente via `output_config.format`), o modo
 * `json_object` da OpenAI só garante um JSON válido, não um formato específico — por isso o
 * schema (`PRODUCT_COPY_SCHEMA`) é validado aqui manualmente depois de parsear, nunca confiando
 * cegamente no texto devolvido.
 */
export class OpenAiCopyProvider implements AiCopyProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateProductCopy(input: GenerateProductCopyInput): Promise<GenerateProductCopyOutput> {
    const client = new OpenAI({ apiKey: this.apiKey });

    const prompt =
      buildProductCopyPrompt(input) +
      '\n\nResponda APENAS com um objeto JSON no formato exato: {"title": "...", "description": "..."} — sem markdown, sem texto fora do JSON.';

    const contentParts: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [{ type: 'text', text: prompt }];

    if (input.image) {
      contentParts.unshift({
        type: 'image_url',
        image_url: { url: `data:${input.image.mimeType};base64,${input.image.base64}` },
      });
    }

    let raw: string | null;
    try {
      const completion = await client.chat.completions.create({
        model: this.model,
        response_format: { type: 'json_object' },
        max_tokens: 1024,
        messages: [{ role: 'user', content: contentParts }],
      });
      raw = completion.choices[0]?.message?.content ?? null;
    } catch (error) {
      throw new BadGatewayException(`Falha ao gerar título/descrição via OpenAI: ${(error as Error).message}`);
    }

    if (!raw) {
      throw new BadGatewayException('A OpenAI não devolveu conteúdo.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadGatewayException('A OpenAI devolveu um JSON inválido.');
    }

    const result = PRODUCT_COPY_SCHEMA.safeParse(parsed);
    if (!result.success) {
      throw new BadGatewayException('A OpenAI devolveu um formato inesperado (sem title/description).');
    }
    return result.data;
  }
}
