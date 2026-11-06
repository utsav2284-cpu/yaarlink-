// The Supabase JS client prefixes the returned SVG with this data-URL header.
// Render it as an image, never as HTML/SVG markup in the document.
export function totpQrImageSource(value: string): string {
  if (typeof value !== 'string' || value.length > 100_000) throw new Error('Invalid QR image');
  const prefix = 'data:image/svg+xml;utf-8,';
  let svg = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  if (/^%3csvg\b/i.test(svg)) {
    try { svg = decodeURIComponent(svg); } catch { throw new Error('Invalid QR image'); }
  }
  if (!/^\s*<svg\b/i.test(svg)) throw new Error('Invalid QR image');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
