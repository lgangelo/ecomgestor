import { BadGatewayException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import {
  AiCopyProvider,
  buildProductCopyPrompt,
  GenerateProductCopyInput,
  GenerateProductCopyOutput,
  PRODUCT_COPY_SCHEMA,
} from './ai-copy.types';

const ANTHROPIC_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export class AnthropicCopyProvider implements AiCopyProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateProductCopy(input: GenerateProductCopyInput): Promise<GenerateProductCopyOutput> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const content: ContentBlockParam[] = [];

    if (input.image && ANTHROPIC_IMAGE_MIME_TYPES.has(input.image.mimeType)) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: input.image.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data: input.image.base64,
        },
      });
    }
    content.push({ type: 'text', text: buildProductCopyPrompt(input) });

    try {
      const response = await client.messages.parse({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
        output_config: { format: zodOutputFormat(PRODUCT_COPY_SCHEMA) },
      });

      if (!response.parsed_output) {
        throw new BadGatewayException('A Claude não devolveu um título/descrição em formato válido.');
      }
      return response.parsed_output;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(`Falha ao gerar título/descrição via Claude: ${(error as Error).message}`);
    }
  }
}
