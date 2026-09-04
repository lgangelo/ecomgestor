class FakeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
  ApiError: FakeApiError,
  Type: { OBJECT: 'OBJECT', STRING: 'STRING' },
}));

import { GeminiCopyProvider } from './gemini-copy.provider';

describe('GeminiCopyProvider — tenta de novo só em erro transitório (429/503, "alta demanda")', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('tenta de novo depois de um 503 e devolve o resultado da segunda tentativa', async () => {
    generateContentMock
      .mockRejectedValueOnce(new FakeApiError('high demand', 503))
      .mockResolvedValueOnce({ text: '{"title":"Bolsa média","description":"Descrição gerada"}' });

    const provider = new GeminiCopyProvider('fake-key', 'gemini-3.6-flash');
    const result = await provider.generateProductCopy({ titleHint: 'Bolsa média' });

    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ title: 'Bolsa média', description: 'Descrição gerada' });
  });

  it('nunca tenta de novo um erro não-transitório (ex.: 404 modelo não encontrado)', async () => {
    generateContentMock.mockRejectedValue(new FakeApiError('model not found', 404));

    const provider = new GeminiCopyProvider('fake-key', 'gemini-3.6-flash');
    await expect(provider.generateProductCopy({ titleHint: 'Bolsa média' })).rejects.toThrow(/model not found/);

    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });
});
