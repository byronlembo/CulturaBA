import { Image, type ImageProps } from 'expo-image';
import { useState } from 'react';
import { eventImageSource, fallbackImage } from '@/lib/images';

/** Imagen de evento con respaldo por disciplina si la fuente no carga. */
export function EventImage({
  imageUrl,
  imageSource,
  discipline,
  ...props
}: Omit<ImageProps, 'source'> & {
  imageUrl: string | null | undefined;
  imageSource: string | null | undefined;
  discipline: string | null | undefined;
}) {
  // Se recuerda qué URL falló; si cambia la URL, se vuelve a intentar sola.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = imageUrl !== null && imageUrl !== undefined && failedUrl === imageUrl;
  const source = failed
    ? fallbackImage(discipline)
    : eventImageSource(imageUrl, imageSource, discipline);
  return (
    <Image
      {...props}
      source={source}
      onError={() => setFailedUrl(imageUrl ?? null)}
      contentFit="cover"
      transition={200}
      accessibilityIgnoresInvertColors
    />
  );
}
