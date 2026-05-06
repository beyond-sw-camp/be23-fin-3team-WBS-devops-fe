import type { RackInventoryGroup } from '@/api/inventory';

/**
 * stock-service occupiedCount 는 불량 전용 로케이션을 제외하는 등과 어긋날 수 있어,
 * 층(locations) 기준으로 보강한 점유 층 수를 쓴다.
 */
export function displayOccupiedCount(rack: RackInventoryGroup): number {
  const fromLocs = rack.locations.filter((l) => {
    const t = l.total_qty ?? 0;
    if (t > 0) return true;
    return (l.available_qty ?? 0) + (l.reserved_qty ?? 0) + (l.pending_qty ?? 0) + (l.defect_qty ?? 0) > 0;
  }).length;
  return Math.max(rack.occupied_count, fromLocs);
}

export function zoneRackLocationTotals(racks: RackInventoryGroup[]) {
  let cap = 0;
  let occ = 0;
  for (const r of racks) {
    cap += r.location_count;
    occ += displayOccupiedCount(r);
  }
  return { cap, occ };
}

/**
 * 랙 적재율(0~100). max_capacity 합이 있으면 수량 기준, 없으면 점유 층 비율 기준.
 * 모니터링 히트맵·KPI에 공통으로 사용한다.
 */
export function rackUtilizationPct(rack: RackInventoryGroup): number {
  let total = 0;
  let capacity = 0;
  rack.locations.forEach((loc) => {
    total += loc.total_qty ?? 0;
    if (loc.max_capacity != null && loc.max_capacity > 0) capacity += loc.max_capacity;
  });
  if (capacity > 0) return Math.min(100, Math.round((total / capacity) * 100));
  if (rack.location_count <= 0) return 0;
  return Math.round((displayOccupiedCount(rack) / rack.location_count) * 100);
}
