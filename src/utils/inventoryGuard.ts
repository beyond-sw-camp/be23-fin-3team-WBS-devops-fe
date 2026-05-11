import type { InventoryByRack, RackInventoryGroup } from '@/api/inventory';

/** 단일 랙에 재고가 남아있는지 — 어느 location이라도 total_qty > 0 이거나 occupied_count > 0 이면 true */
export function rackHasInventory(rack: RackInventoryGroup | undefined | null): boolean {
  if (!rack) return false;
  if (rack.occupied_count > 0) return true;
  if (rack.total_available_qty > 0) return true;
  return rack.locations.some((loc) => loc.total_qty > 0);
}

/** rackId에 해당하는 그룹만 검사 */
export function rackIdHasInventory(byRack: InventoryByRack | undefined | null, rackId: string): boolean {
  const g = byRack?.racks.find((r) => r.rack_id === rackId);
  return rackHasInventory(g);
}

/** zoneId에 속한 랙 중 하나라도 재고가 있으면 true. 점유된 랙코드 목록도 함께 반환. */
export function zoneInventorySummary(byRack: InventoryByRack | undefined | null, zoneId: string): {
  hasInventory: boolean;
  occupiedRackCodes: string[];
} {
  const racks = byRack?.racks.filter((r) => r.zone_id === zoneId) ?? [];
  const occupied = racks.filter(rackHasInventory);
  return {
    hasInventory: occupied.length > 0,
    occupiedRackCodes: occupied.map((r) => r.rack_code),
  };
}

/** 창고 전체에서 재고가 있는 랙이 하나라도 있으면 true */
export function warehouseInventorySummary(byRack: InventoryByRack | undefined | null): {
  hasInventory: boolean;
  occupiedRackCodes: string[];
} {
  const occupied = (byRack?.racks ?? []).filter(rackHasInventory);
  return {
    hasInventory: occupied.length > 0,
    occupiedRackCodes: occupied.map((r) => r.rack_code),
  };
}
