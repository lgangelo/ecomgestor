import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AiCopyService } from './ai-copy.service';
import { GenerateProductCopyDto } from './dto/generate-product-copy.dto';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — mesmo limite do upload de foto de produto.
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('ai')
export class AiController {
  constructor(private readonly aiCopy: AiCopyService) {}

  /**
   * Gera título + descrição de produto — nunca vinculado a um produto/variação específico
   * (funciona tanto no cadastro, antes do produto existir, quanto na edição de um já existente):
   * o frontend sempre manda o que já tem localmente (rascunho de título/descrição, atributos já
   * preenchidos, e a foto — recém-selecionada ou buscada da já cadastrada). Resultado é sempre
   * uma SUGESTÃO editável, nunca salvo automaticamente.
   */
  @Post('generate-product-copy')
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  async generateProductCopy(@Body() dto: GenerateProductCopyDto, @UploadedFile() file?: UploadedImageFile) {
    if (file) {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException('Formato de imagem não suportado — envie JPEG, PNG ou WEBP.');
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        throw new BadRequestException(`Imagem excede o tamanho máximo de ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`);
      }
    }

    return this.aiCopy.generateProductCopy({
      titleHint: dto.titleHint,
      descriptionHint: dto.descriptionHint,
      category: dto.category,
      color: dto.color,
      size: dto.size,
      brand: dto.brand,
      image: file ? { base64: file.buffer.toString('base64'), mimeType: file.mimetype } : undefined,
    });
  }
}
