const LOCATION_RE = /^([A-Z0-9]+)-([A-Z0-9]+)-(\d{2})-(\d{2})$/;

function cleanToken(v?: string | null): string {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function pad2(v?: number | string | null): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '01';
  return String(Math.trunc(n)).padStart(2, '0');
}

export interface LocationParts {
  zone: string;
  rack: string;
  rowNo: string;
  levelNo: string;
}

export function buildLocationCode(parts: {
  zone?: string | null;
  rack?: string | null;
  rowNo?: number | string | null;
  levelNo?: number | string | null;
}): string {
  const zone = cleanToken(parts.zone) || 'A';
  const rack = cleanToken(parts.rack) || 'L';
  const rowNo = pad2(parts.rowNo);
  const levelNo = pad2(parts.levelNo);
  return `${zone}-${rack}-${rowNo}-${levelNo}`;
}

export function parseLocationCode(raw?: string | null): LocationParts | null {
  const value = String(raw ?? '').trim().toUpperCase();
  const m = value.match(LOCATION_RE);
  if (!m) return null;
  return { zone: m[1], rack: m[2], rowNo: m[3], levelNo: m[4] };
}

export function ensureLocationCode(raw?: string | null, fallback?: {
  zone?: string | null;
  rack?: string | null;
  rowNo?: number | string | null;
  levelNo?: number | string | null;
}): string {
  const parsed = parseLocationCode(raw);
  if (parsed) return `${parsed.zone}-${parsed.rack}-${parsed.rowNo}-${parsed.levelNo}`;
  return buildLocationCode(fallback ?? {});
}

/**
 * 위치 코드를 사람이 읽기 쉽게 축약 — rack code + 층 번호.
 *
 * 예) `LC-RK-ZN-JEJ-AUDIO-025-SELF-059-01` → `SELF-059 · 1층`
 * 예) `LC-RK-...-CK-018-03`               → `CK-018 · 3층`
 *
 * 마지막 3개 토큰을 [rackPrefix, rackNo, floor] 로 가정. 마지막 토큰이 숫자가 아니거나
 * 토큰이 부족하면 원본을 그대로 반환 (안전 fallback).
 */
export function shortLocationCode(raw?: string | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const parts = s.split('-').filter(Boolean);
  if (parts.length < 3) return s;
  const [rackPrefix, rackNo, floor] = parts.slice(-3);
  if (!/^\d+$/.test(floor)) return parts.slice(-3).join('-');
  return `${rackPrefix}-${rackNo} · ${parseInt(floor, 10)}층`;
}

export function formatLocationCodeRangeCompact(startRaw?: string | null, endRaw?: string | null): string {
  const start = parseLocationCode(startRaw);
  const end = parseLocationCode(endRaw);
  if (!start || !end) {
    return [startRaw, endRaw].filter(Boolean).join(' ~ ');
  }

  if (start.zone === end.zone && start.rack === end.rack) {
    return `${start.zone}-${start.rack} (${start.rowNo}-${start.levelNo} ~ ${end.rowNo}-${end.levelNo})`;
  }

  return `${start.zone}-${start.rack}-${start.rowNo}-${start.levelNo} ~ ${end.zone}-${end.rack}-${end.rowNo}-${end.levelNo}`;
}
