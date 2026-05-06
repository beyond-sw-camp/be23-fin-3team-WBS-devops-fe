export type SlotStatus = 'empty' | 'stocked' | 'working';

/** 캔버스·모달 공통 슬롯 면 색 */
export const SLOT_STATUS_FILL: Record<SlotStatus, string> = {
  empty: '#595959',
  stocked: '#fa8c16',
  working: '#1677ff',
};

export function slotKey(row: number, col: number) {
  return `${row}-${col}`;
}

/** 저장된 상태가 없으면 rackId·좌표 기반 시드로 데모 분포 */
export function getSlotStatus(
  slotStates: Record<string, SlotStatus> | undefined,
  row: number,
  col: number,
  rackId: number,
): SlotStatus {
  const key = slotKey(row, col);
  const stored = slotStates?.[key];
  if (stored) return stored;
  const seed = Number(rackId) + row * 31 + col * 17;
  const m = Math.abs(seed) % 100;
  if (m < 35) return 'empty';
  if (m < 82) return 'stocked';
  return 'working';
}

export function cellAddressLabel(rackCode: string, row: number, col: number, colCount: number) {
  const head = (rackCode.split('-')[0] || rackCode || 'R').replace(/\s/g, '').slice(0, 4) || 'R';
  const idx = row * colCount + col + 1;
  const pad = idx >= 100 ? 3 : 2;
  return `${head}-${String(idx).padStart(pad, '0')}`;
}
