'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

/**
 * Campo de vídeo opcional (1 por produto) — mesmo padrão de `ImageUploadField`: mostra uma
 * prévia local do arquivo escolhido (ou o vídeo já salvo, ao editar) antes de enviar; quem chama
 * decide QUANDO de fato faz o upload (o pai só recebe o `File` escolhido via `onFileSelect`).
 */
export function VideoUploadField({
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
        {preview && <video src={preview} controls className="h-24 w-40 rounded-md border border-border object-cover" />}
        <Input id={id} type="file" accept="video/mp4,video/quicktime,video/webm" onChange={handleChange} className="max-w-xs" />
      </div>
      <p className="text-xs text-muted-foreground">Vídeo vertical, até 1 minuto, no máximo 100MB.</p>
    </div>
  );
}
