/**
 * 쿼리 returnTo / 외부에서 넘긴 문자열 — 오픈 리다이렉트 방지용.
 * 동일 origin의 상대 경로만 통과(경로 + 쿼리 + 해시).
 */
export function parseSafeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let path: string;
  try {
    path = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (/[\n\r\0]/.test(path)) return null;
  if (path.includes('\\')) return null;
  if (/^\/[a-zA-Z][\w+.-]*:/.test(path)) return null; // e.g. /http:evil
  if (typeof window === 'undefined') return path;
  try {
    const u = new URL(path, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}
