import type { ZoneType, WarehouseType } from '@/types/warehouse';
import type { SizeType } from '@/types/product';

export const WAREHOUSE_TYPE_LABEL: Record<WarehouseType, string> = {
  NORMAL: '일반',
  RETURN_DEFECT: '반품·불량',
  DISPOSAL: '폐기',
};

export const WAREHOUSE_TYPE_COLOR: Record<WarehouseType, string> = {
  NORMAL: 'blue',
  RETURN_DEFECT: 'orange',
  DISPOSAL: 'red',
};

export const ZONE_TYPE_LABEL: Record<ZoneType, string> = {
  STORAGE: '보관존',
  INBOUND: '입고존',
  OUTBOUND: '출고존',
  DEFECT: '불량존',
};

export const ZONE_TYPE_COLOR: Record<ZoneType, string> = {
  STORAGE: 'blue',
  INBOUND: 'green',
  OUTBOUND: 'orange',
  DEFECT: 'red',
};

export const SIZE_TYPE_LABEL: Record<SizeType, string> = {
  small: '소형',
  medium: '중형',
  large: '대형',
};
