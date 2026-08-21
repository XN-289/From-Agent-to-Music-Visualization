// 媒体文件 MIME 与扩展名推断：Stage 上传、MP3 APIC、封面路由共用。
// Provider 图片通常返回 jpeg/png/webp；本地兜底封面固定为 png。

export function extensionForFilePath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return ext.replace(/[^a-z0-9]/g, '');
}

export function coverMimeForPath(filePath: string): string {
  switch (extensionForFilePath(filePath)) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'png':
    default:
      return 'image/png';
  }
}

export function audioMimeForPath(filePath: string): string {
  switch (extensionForFilePath(filePath)) {
    case 'wav':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    case 'm4a':
      return 'audio/mp4';
    case 'mp3':
    default:
      return 'audio/mpeg';
  }
}

export function extensionForImageUrl(
  url: string,
  contentType?: string | null,
): string {
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  const match = pathname.match(/\.(jpe?g|png|webp)(?:$|[^a-z0-9])/);
  if (match) return match[1] === 'jpeg' ? 'jpg' : match[1];

  const mime = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';

  // Suno 系网关最常见的是 jpeg；无扩展名时优先保存为 jpg。
  return 'jpg';
}
