const PALETTE = ['magenta', 'red', 'volcano', 'orange', 'gold', 'lime', 'green', 'cyan', 'blue', 'geekblue', 'purple'];

export function tagColorByKey(key?: string | null): string {
  const src = String(key ?? '').trim();
  if (!src) return 'default';
  let hash = 0;
  for (let i = 0; i < src.length; i++) hash = (hash * 31 + src.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}
