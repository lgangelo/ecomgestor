import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../common/prisma/prisma.service';
import { ProductsService } from './products.service';

const COMPANY_ID = 'company-1';

function makeConfig(storageDir: string): ConfigService {
  return { get: (key: string) => (key === 'productImageStorageDir' ? storageDir : undefined) } as unknown as ConfigService;
}

function fakeImageFile(name = 'photo.jpg') {
  return { originalname: name, mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('fake-image-bytes') };
}

describe('ProductsService — upload de foto do produto/variação', () => {
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'product-images-test-'));
  });

  afterEach(async () => {
    await rm(storageDir, { recursive: true, force: true });
  });

  it('salva a foto num arquivo por empresa e devolve o path servido pelo endpoint (nunca o caminho de disco real)', async () => {
    const productUpdate = jest.fn().mockImplementation(({ data }) => ({ id: 'product-1', ...data }));
    const prisma = {
      client: {
        product: {
          findFirst: jest.fn().mockResolvedValue({ id: 'product-1', companyId: COMPANY_ID, imageUrl: null }),
          update: productUpdate,
        },
      },
    };
    const service = new ProductsService(prisma as unknown as PrismaService, makeConfig(storageDir));

    const updated = await service.uploadProductImage('product-1', COMPANY_ID, fakeImageFile());

    expect(updated.imageUrl).toMatch(new RegExp(`^/products/images/${COMPANY_ID}/[0-9a-f-]+\\.jpg$`));
    const files = await readdir(join(storageDir, COMPANY_ID));
    expect(files).toHaveLength(1);
  });

  it('rejeita um formato de arquivo não suportado', async () => {
    const prisma = { client: { product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1', companyId: COMPANY_ID, imageUrl: null }) } } };
    const service = new ProductsService(prisma as unknown as PrismaService, makeConfig(storageDir));

    await expect(
      service.uploadProductImage('product-1', COMPANY_ID, { ...fakeImageFile(), mimetype: 'application/pdf' }),
    ).rejects.toThrow(/formato de imagem não suportado/i);
  });

  it('ao trocar a foto, apaga a anterior SÓ quando ela foi salva localmente por este mesmo mecanismo — nunca uma URL externa (ex.: importada da TikTok)', async () => {
    const prisma = {
      client: {
        product: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'product-1', companyId: COMPANY_ID, imageUrl: 'https://cdn.tiktok.example/foto-original.jpg' }),
          update: jest.fn().mockImplementation(({ data }) => ({ id: 'product-1', ...data })),
        },
      },
    };
    const service = new ProductsService(prisma as unknown as PrismaService, makeConfig(storageDir));

    // Não deve lançar erro tentando apagar um arquivo que nunca existiu no nosso disco.
    await expect(service.uploadProductImage('product-1', COMPANY_ID, fakeImageFile())).resolves.toBeDefined();
  });
});
