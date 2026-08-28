/**
 * Utility for on-the-fly image optimization using wsrv.nl,
 * a global, fast, free-tier CDN image resizing proxy.
 * This saves massive bandwidth and storage consumption while making the app load lightning fast.
 */

/**
 * Get an optimized, resized, and compressed version of an image URL.
 * - 'low': 320px width, 55% quality, WebP format. Ideal for folder/gallery grids and thumbnail lists.
 * - 'medium': 1200px width, 75% quality, WebP format. Perfect for the Media Lightbox Viewer (excellent sharp visuals, 1/10th the file size).
 * - 'original': Direct R2 S3 storage link. Used for original downloads and full quality files.
 */
export function getOptimizedImageUrl(
  url: string | undefined,
  quality: 'low' | 'medium' | 'original' = 'low'
): string | null {
  if (!url) return null;

  // Only optimize external full HTTP/S URLs (our R2 bucket files)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return url || null;
  }

  // Skip YouTube thumbnails (they are already optimized) or already optimized links
  if (url.includes('img.youtube.com') || url.includes('wsrv.nl')) {
    return url;
  }

  // S3 R2 buckets can contain spaces and special characters. Let's make sure the URL is properly formatted.
  // Note: If the URL is already fully encoded, we should not double-encode.
  const encodedUrl = encodeURIComponent(url);

  switch (quality) {
    case 'low':
      // 320px width, 55% quality, webp format.
      return `https://wsrv.nl/?url=${encodedUrl}&w=320&q=55&output=webp`;
    case 'medium':
      // 1200px width, 75% quality, webp format.
      return `https://wsrv.nl/?url=${encodedUrl}&w=1200&q=75&output=webp`;
    case 'original':
    default:
      return url;
  }
}
