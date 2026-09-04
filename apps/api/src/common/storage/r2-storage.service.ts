import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Cliente S3 genérico apontado pro Cloudflare R2 (API compatível com S3) — um único client
 * serve os dois buckets (público de fotos, privado de fiscal), o bucket é sempre passado por
 * parâmetro em cada chamada, nunca fixo no client. `enabled` reflete se as três credenciais
 * básicas (endpoint/access key/secret) estão configuradas — quem chama decide o fallback (disco
 * local) quando `false`, este serviço nunca decide isso sozinho.
 */
@Injectable()
export class R2StorageService {
  private readonly client: S3Client | null;

  constructor(private readonly config: ConfigService) {
    const r2 = this.config.get<{ endpoint: string; accessKeyId: string; secretAccessKey: string }>('r2')!;
    this.client =
      r2.endpoint && r2.accessKeyId && r2.secretAccessKey
        ? new S3Client({
            region: 'auto',
            endpoint: r2.endpoint,
            credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
          })
        : null;
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new Error('R2 não configurado — R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY ausentes.');
    }
    return this.client;
  }

  async putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.requireClient().send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    const result = await this.requireClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await result.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  /** Best-effort por natureza (quem chama decide se ignora a falha) — nunca lança se o objeto já
   * não existir, R2/S3 trata DELETE de uma chave inexistente como sucesso. */
  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.requireClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
