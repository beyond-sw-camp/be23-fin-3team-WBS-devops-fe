/** 백엔드 WarehouseType enum과 1:1 매핑 */
export type WarehouseType = 'NORMAL' | 'RETURN_DEFECT' | 'DISPOSAL';

export type RegionCode = 'SEL' | 'PUS' | 'DAE' | 'ICN' | 'GWJ' | 'DJN' | 'USN';

export interface Warehouse {
  /** 백엔드 UUID */
  id: string;
  /** 백엔드 자동 생성 (예: WH-SEL-NOR-001) */
  code: string;
  name: string;
  address: string;
  /** 창고 코드 자동 생성에 사용 — 미지정 시 백엔드 기본값 SEL */
  region_code?: RegionCode;
  /** 창고 유형 — 미지정 시 NORMAL */
  warehouse_type?: WarehouseType;
  zone_count: number;
  rack_count: number;
  is_active: boolean;
  /** 목록 요약용 — API 미전달 시 생략 가능 */
  updated_at?: string;
  /** 랙 적재 사용률 0–100(추정/집계) — 선택 */
  rack_utilization_percent?: number;
  /** 현장/창고 담당자 표시명 */
  manager_name?: string;
  /** 연락처 */
  phone?: string;
  /** 특이사항·메모 */
  notes?: string;
}

export interface WarehouseCanvas {
  warehouse_id: string;
  canvas_width: number;
  canvas_height: number;
  bg_color: string;
}

/** 백엔드 ZoneType enum과 1:1 매핑 (기능 관점) */
export type ZoneType = 'STORAGE' | 'INBOUND' | 'OUTBOUND' | 'DEFECT';

export interface Zone {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  /** 상품 대분류 카테고리 FK (백엔드 ProductCategory UUID) */
  category_id?: string | null;
  /** 상품 대분류 카테고리 이름 (조회용, 표시 전용) */
  category_major?: string;
  zone_type: ZoneType;
  rack_count: number;
  sort_order: number;
  is_active: boolean;
}

export interface ZoneLayout {
  id?: string;
  zone_id: string;
  warehouse_id: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
}

export interface RackLayout {
  rack_id: string;
  zone_id: string;
  warehouse_id: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  /** 랙 내부 슬롯(좌석표) 행 수 */
  internal_rows?: number;
  /** 랙 내부 슬롯 열 수 */
  internal_cols?: number;
  /** 슬롯 키 "r-c" → 상태 JSON */
  slot_states_json?: string;
}

export interface RackStock {
  rack_code: string;
  rack_id: string;
  sku: string;
  product_name: string;
  available_qty: number;
  reserved_qty: number;
  total_qty: number;
  /** 입고일 (YYYY-MM-DD 등) — 모니터링 상세용 */
  inbound_date?: string;
}

export interface Rack {
  id: string;
  zone_id: string;
  warehouse_id: string;
  code: string;
  name: string;
  /** 입고처 전용 랙 지정 — 백엔드 supplierId */
  supplier_id?: string | null;
  supplier_name?: string | null;
  /** 기본 층 수 */
  level_no?: number;
  /** 층별 상품군/가이드 라벨 JSON 문자열 (["1층 키보드", ...]) */
  level_guide_json?: string | null;
  /** 최대 수용 수량 */
  max_capacity?: number;
  /** 랙 내부 치수 (mm) — 적치 시 상품 크기 경고용 */
  width?: number | null;
  depth?: number | null;
  height?: number | null;
  is_active: boolean;
}
