import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicCopyProvider } from './anthropic-copy.provider';
import { OpenAiCopyProvider } from './openai-copy.provider';
import { GenerateProductCopyInput, GenerateProductCopyOutput } from './ai-copy.types';

/**
 * Ponto único de entrada da geração de título/descrição por IA — "integração neutra" pedida
 * pelo usuário: o provedor de verdade (Anthropic ou OpenAI) é escolhido pela variável de
 * ambiente `AI_PROVIDER`, nunca hard-coded, então trocar de um pro outro é só configuração,
 * sem mudar nenhuma tela nem chamada do frontend.
 */
@Injectable()
export class AiCopyService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const provider = this.config.get<string | null>('ai.provider', { infer: true });
    if (provider === 'anthropic') return Boolean(this.config.get<string>('ai.anthropicApiKey', { infer: true }));
    if (provider === 'openai') return Boolean(this.config.get<string>('ai.openaiApiKey', { infer: true }));
    return false;
  }

  async generateProductCopy(input: GenerateProductCopyInput): Promise<GenerateProductCopyOutput> {
    const provider = this.config.get<'anthropic' | 'openai' | null>('ai.provider', { infer: true });

    if (provider === 'anthropic') {
      const apiKey = this.config.get<string>('ai.anthropicApiKey', { infer: true }) as string;
      if (!apiKey) throw new BadRequestException('ANTHROPIC_API_KEY não configurada.');
      const model = this.config.get<string>('ai.anthropicModel', { infer: true }) as string;
      return new AnthropicCopyProvider(apiKey, model).generateProductCopy(input);
    }

    if (provider === 'openai') {
      const apiKey = this.config.get<string>('ai.openaiApiKey', { infer: true }) as string;
      if (!apiKey) throw new BadRequestException('OPENAI_API_KEY não configurada.');
      const model = this.config.get<string>('ai.openaiModel', { infer: true }) as string;
      return new OpenAiCopyProvider(apiKey, model).generateProductCopy(input);
    }

    throw new BadRequestException(
      'Geração de título/descrição por IA não configurada. Defina AI_PROVIDER=anthropic ou AI_PROVIDER=openai (e a respectiva chave de API) para habilitar.',
    );
  }
}
