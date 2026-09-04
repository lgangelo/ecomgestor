'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

/**
 * Campo de foto opcional (capa do produto ou de uma variação) — nunca obrigatório. Mostra uma
 * prévia local do arquivo escolhido (ou a foto já salva, ao editar) antes de enviar; quem chama
 * decide QUANDO de fato faz o upload (o pai só recebe o `File` escolhido via `onFileSelect`).
 */
export function ImageUploadField({
  id,
  label,
  existingUrl,
  onFileSelect,
}: {
  id: string;
  label: string;
  existingUrl?: string;
  onFileSelect: (file: File | null) => void;
}) {
  const [objectUrl, setObjectUrl] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    onFileSelect(file);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(file ? URL.createObjectURL(file) : undefined);
  }

  const preview = objectUrl ?? existingUrl;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- prévia de arquivo local (blob:) ou já hospedado, nunca otimizável pelo Next/Image
          <img src={preview} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
        )}
        <Input id={id} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleChange} className="max-w-xs" />
      </div>
    </div>
  );
}
