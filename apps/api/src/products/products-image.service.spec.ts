import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { R2StorageService } from '../common/storage/r2-storage.service';
import { ProductsService } from './products.service';

const COMPANY_ID = 'company-1';
// R2 desligado (sem credenciais) nos testes de disco local — só o fallback de disco é exercido
// aqui; o R2 nunca é chamado quando `r2.enabled` é false.
const DISABLED_R2_CONFIG = { enabled: false, imagesBucket: '', imagesPublicBaseUrl: '' };
const fakeR2Service = {} as unknown as R2StorageService;

function makeConfig(storageDir: string): ConfigService {
  return {
    get: (key: string) => (key === 'productImageStorageDir' ? storageDir : key === 'r2' ? DISABLED_R2_CONFIG : undefined),
  } as unknown as ConfigService;
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
    const service = new ProductsService(prisma as unknown as PrismaService, makeConfig(storageDir), fakeR2Service);

    const updated = await service.uploadProductImage('product-1', COMPANY_ID, fakeImageFile());

    expect(updated.imageUrl).toMatch(new RegExp(`^/products/images/${COMPANY_ID}/[0-9a-f-]+\\.jpg$`));
    const files = await readdir(join(storageDir, COMPANY_ID));
    expect(files).toHaveLength(1);
  });

  it('rejeita um formato de arquivo não suportado', async () => {
    const prisma = { client: { product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1', companyId: COMPANY_ID, imageUrl: null }) } } };
    const service = new ProductsService(prisma as unknown as PrismaService, makeConfig(storageDir), fakeR2Service);

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
    const service = new ProductsService(prisma as unknown as PrismaService, makeConfig(storageDir), fakeR2Service);

    // Não deve lançar erro tentando apagar um arquivo que nunca existiu no nosso disco.
    await expect(service.uploadProductImage('product-1', COMPANY_ID, fakeImageFile())).resolves.toBeDefined();
  });
});

describe('ProductsService — galeria de fotos adicionais do produto (até 5, independente da capa)', () => {
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'product-images-gallery-test-'));
  });

  afterEach(async () => {
    await rm(storageDir, { recursive: true, force: true });
  });

  function makePrisma(existingCount: number) {
    return {
      client: {
        product: {
          findFirst: jest.fn().mockResolvedValue({ id: 'product-1', companyId: COMPANY_ID, imageUrl: null }),
          update: jest.fn().mockImplementation(({ data }) => ({ id: 'product-1', ...data })),
        },
        productImage: {
          count: jest.fn().mockResolvedValue(existingCount),
          create: jest.fn().mockImplementation(({ data }) => ({ id: 'image-new', ...data })),
          findFirst: jest.fn().mockResolvedValue({ id: 'image-1', productId: 'product-1', url: '/products/images/company-1/existing.jpg' }),
          delete: jest.fn(),
        },
      },
    };
  }

  it('adiciona uma foto normalmente quando a galeria ainda não chegou ao limite', async () => {
    const prisma = makePrisma(4);
    const service = new ProductsService(prisma as unknown as PrismaService, makeConfig(storageDir), fakeR2Service);

    const image = await service.addProductImage('product-1', COMPANY_ID, fakeImageFile());

    expect(image.position).toBe(4);
    expect(prisma.client.productImage.create).toHaveBeenCalled();
  });

  it('rejeita a 6ª foto — limite de 5 por produto', async () => {
    const prisma = makePrisma(5);
    const service = new ProductsService(prisma as unknown as PrismaService, makeConfig(storageDir), fakeR2Service);

    await expect(service.addProductImage('product-1', COMPANY_ID, fakeImageFile())).rejects.toThrow(/máximo de 5 fotos|máximo 5 fotos/i);
    expect(prisma.client.productImage.create).not.toHaveBeenCalled();
  });

  it('remove uma foto da galeria e apaga o arquivo local correspondente', async () => {
    const prisma = makePrisma(1);
    const service = new ProductsService(prisma as unknown as PrismaService, makeConfig(storageDir), fakeR2Service);
    // Foto "existente" apontada pelo findFirst mockado não existe fisicamente no disco de teste —
    // a exclusão deve ser best-effort (nunca lançar) mesmo assim.
    await expect(service.removeProductImage('product-1', 'image-1', COMPANY_ID)).resolves.toBeUndefined();
    expect(prisma.client.productImage.delete).toHaveBeenCalledWith({ where: { id: 'image-1' } });
  });

  it('promove uma foto da galeria a capa do produto sem apagar a capa anterior do disco', async () => {
    const prisma = makePrisma(1);
    const service = new ProductsService(prisma as unknown as PrismaService, makeConfig(storageDir), fakeR2Service);

    const updated = await service.setProductCoverImage('product-1', 'image-1', COMPANY_ID);

    expect(updated.imageUrl).toBe('/products/images/company-1/existing.jpg');
    expect(prisma.client.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { imageUrl: '/products/images/company-1/existing.jpg' },
    });
  });
});

describe('ProductsService — upload de foto quando o R2 está configurado (Cloudflare R2)', () => {
  const ENABLED_R2_CONFIG = {
    enabled: true,
    imagesBucket: 'ecomgestor',
    imagesPublicBaseUrl: 'https://bucket.btechsecurity.com.br',
  };

  function makeR2Config(): ConfigService {
    return {
      get: (key: string) => (key === 'r2' ? ENABLED_R2_CONFIG : undefined),
    } as unknown as ConfigService;
  }

  it('grava no bucket público do R2 (nunca em disco) e devolve a URL pública completa', async () => {
    const prisma = {
      client: {
        product: {
          findFirst: jest.fn().mockResolvedValue({ id: 'product-1', companyId: COMPANY_ID, imageUrl: null }),
          update: jest.fn().mockImplementation(({ data }) => ({ id: 'product-1', ...data })),
        },
      },
    };
    const putObject = jest.fn().mockResolvedValue(undefined);
    const r2 = { putObject, deleteObject: jest.fn() } as unknown as R2StorageService;
    const service = new ProductsService(prisma as unknown as PrismaService, makeR2Config(), r2);

    const updated = await service.uploadProductImage('product-1', COMPANY_ID, fakeImageFile());

    expect(putObject).toHaveBeenCalledWith(
      'ecomgestor',
      expect.stringMatching(new RegExp(`^imagens/${COMPANY_ID}/[0-9a-f-]+\\.jpg$`)),
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(updated.imageUrl).toMatch(
      new RegExp(`^https://bucket\\.btechsecurity\\.com\\.br/imagens/${COMPANY_ID}/[0-9a-f-]+\\.jpg$`),
    );
  });

  it('ao trocar a foto, apaga a anterior do R2 quando ela também estava lá (nunca uma URL externa de verdade)', async () => {
    const previousUrl = `https://bucket.btechsecurity.com.br/imagens/${COMPANY_ID}/antiga.jpg`;
    const prisma = {
      client: {
        product: {
          findFirst: jest.fn().mockResolvedValue({ id: 'product-1', companyId: COMPANY_ID, imageUrl: previousUrl }),
          update: jest.fn().mockImplementation(({ data }) => ({ id: 'product-1', ...data })),
        },
      },
    };
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const r2 = { putObject: jest.fn().mockResolvedValue(undefined), deleteObject } as unknown as R2StorageService;
    const service = new ProductsService(prisma as unknown as PrismaService, makeR2Config(), r2);

    await service.uploadProductImage('product-1', COMPANY_ID, fakeImageFile());

    expect(deleteObject).toHaveBeenCalledWith('ecomgestor', `imagens/${COMPANY_ID}/antiga.jpg`);
  });
});
