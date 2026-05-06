import type { RackInventoryGroup } from '@/api/inventory';

function norm(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase();
}

/** LC-RK-...-01 => RK-... 추론 */
function inferRackCodeFromLocationCode(locationCode: string): string {
  const raw = norm(locationCode);
  if (!raw) return '';
  const noPrefix = raw.startsWith('LC-') ? raw.slice(3) : raw;
  const parts = noPrefix.split('-').filter(Boolean);
  if (parts.length <= 1) return noPrefix;
  const last = parts[parts.length - 1] ?? '';
  if (/^\d+$/.test(last)) return parts.slice(0, -1).join('-');
  return noPrefix;
}

/**
 * URL 딥링크(locationId / locationCode / rackCode)로 랙 그룹을 찾는다.
 * - 불량존 등에서 BE 간 locationId 포맷 불일치 시 rackCode·locationCode 로 보강
 */
export function findRackGroupForMonitorDeepLink(
  racks: RackInventoryGroup[],
  opts: { locationId: string | null; locationCode: string | null; rackCode: string | null },
): RackInventoryGroup | null {
  const { locationId, locationCode, rackCode } = opts;
  const lid = norm(locationId);
  const lcode = norm(locationCode);
  const rcode = norm(rackCode);

  if (lid) {
    const by = racks.find((r) =>
      r.locations.some((x) => norm(x.location_id) === lid),
    );
    if (by) return by;
  }
  if (lcode) {
    const byExact = racks.find((r) =>
      r.locations.some((x) => norm(x.location_code) === lcode),
    );
    if (byExact) return byExact;
    const byLoose = racks.find((r) =>
      r.locations.some((x) => {
        const c = norm(x.location_code);
        if (!c) return false;
        return c === lcode || c.includes(lcode) || lcode.includes(c);
      }),
    );
    if (byLoose) return byLoose;
  }
  const inferredRack = inferRackCodeFromLocationCode(lcode);
  if (rcode && rcode !== '(미정)') {
    const byR = racks.find((r) => norm(r.rack_code) === rcode);
    if (byR) return byR;
  }
  if (inferredRack) {
    const byInferred = racks.find((r) => norm(r.rack_code) === inferredRack);
    if (byInferred) return byInferred;
  }
  return null;
}
