import type { Product } from '@/types/product';
import type { Zone, Rack, RackStock } from '@/types/warehouse';

export interface RackRecommendation {
  rackId: string;
  rackCode: string;
  zoneName: string;
  vendorName: string | null;
  qty: number;
  currentQty: number;
  maxCapacity: number;
  remainCapacity: number;
  reason: string;
  warning: string | null;
}

/** 랙별 기본 최대 수용량 (max_capacity가 없을 때) */
const DEFAULT_MAX_CAPACITY = 200;

function normalize(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '');
}

function categoryMatchesZone(category: string, zone: Zone): boolean {
  const c = normalize(category);
  const pool = [zone.name, zone.code].map((x) => normalize(x));
  return pool.some((v) => v.includes(c) || c.includes(v));
}

export function recommendRack(
  product: Product,
  vendorId: string | null,
  warehouseId: string,
  qty: number,
  zones: Zone[],
  racks: Rack[],
  rackStocks: RackStock[],
): RackRecommendation[] {
  // 현재 랙별 총 재고량 맵
  const rackQtyMap = new Map<string, number>();
  rackStocks.forEach((s) => { rackQtyMap.set(s.rack_id, (rackQtyMap.get(s.rack_id) ?? 0) + s.total_qty); });

  // 해당 SKU 이미 보관중인 랙 ID
  const skuRackIds = new Set(rackStocks.filter((s) => s.sku === product.sku).map((s) => s.rack_id));

  // 해당 창고의 보관(STORAGE) 구역만
  const storageZones = zones.filter((z) => z.warehouse_id === warehouseId && z.zone_type === 'STORAGE' && z.is_active);

  // 우선순위 1: 상품 카테고리와 매칭되는 구역
  const categoryZones = storageZones.filter((z) => categoryMatchesZone(product.category, z));
  const targetZones = categoryZones.length > 0 ? categoryZones : storageZones;

  if (targetZones.length === 0) return [{ rackId: '', rackCode: '-', zoneName: '-', vendorName: null, qty, currentQty: 0, maxCapacity: 0, remainCapacity: 0, reason: '', warning: '적합한 구역이 없습니다' }];

  const targetZoneIds = new Set(targetZones.map((z) => z.id));
  const candidateRacks = racks.filter((r) => targetZoneIds.has(r.zone_id) && r.is_active);

  // 우선순위 3~5:
  // 3) 동일 SKU 적재 랙
  // 4) 잔여용량이 적절한 랙(과밀/과소 제외)
  // 5) 빈 랙
  const scored = candidateRacks.map((rack) => {
    const zone = targetZones.find((z) => z.id === rack.zone_id);
    const currentQty = rackQtyMap.get(rack.id) ?? 0;
    const cap = rack.max_capacity ?? DEFAULT_MAX_CAPACITY;
    const remain = cap - currentQty;
    const hasSameSku = skuRackIds.has(rack.id);
    const isEmpty = currentQty === 0;
    const isVendorRack = rack.supplier_id === vendorId && vendorId !== null;

    let score = 0;
    let reason = '';
    const categoryMatch = !!zone && categoryMatchesZone(product.category, zone);
    const fitRemain = cap > 0 ? remain / cap : 0;
    if (categoryMatch) { score += 160; reason = '카테고리 매칭 구역'; }
    if (isVendorRack) { score += 120; reason = reason || '입고처 전용 랙'; }
    if (hasSameSku && remain > 0) { score += 90; reason = reason || '동일 SKU 보관중'; }
    if (fitRemain >= 0.1 && fitRemain <= 0.8) { score += 30; reason = reason || '근접 동선 우선 후보'; }
    if (isEmpty) { score += 10; reason = reason || '빈 랙'; }
    if (!reason) reason = '기타';

    return { rack, zone, currentQty, remain, cap, score, reason };
  }).filter((r) => r.remain > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [{ rackId: '', rackCode: '-', zoneName: '-', vendorName: null, qty, currentQty: 0, maxCapacity: 0, remainCapacity: 0, reason: '', warning: '수용 가능한 빈 랙이 없습니다' }];

  // 자동 분할 배정
  const results: RackRecommendation[] = [];
  let remaining = qty;

  for (const candidate of scored) {
    if (remaining <= 0) break;
    const allocate = Math.min(remaining, candidate.remain);
    results.push({
      rackId: candidate.rack.id,
      rackCode: candidate.rack.code,
      zoneName: candidate.zone?.name ?? '',
      vendorName: candidate.rack.supplier_name ?? null,
      qty: allocate,
      currentQty: candidate.currentQty,
      maxCapacity: candidate.cap,
      remainCapacity: candidate.remain,
      reason: candidate.reason,
      warning: null,
    });
    remaining -= allocate;
  }

  if (remaining > 0) {
    results.push({
      rackId: '', rackCode: '-', zoneName: '-', vendorName: null,
      qty: remaining, currentQty: 0, maxCapacity: 0, remainCapacity: 0,
      reason: '', warning: `수용량 부족 (${remaining}개 미배정)`,
    });
  }

  return results;
}
