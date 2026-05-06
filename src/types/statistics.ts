/** 월별 입출고 추이 — GET /statistic/monthly-inout */
export interface MonthlyInOut {
  month: string;
  inbound_qty: number;
  outbound_qty: number;
}

/** 일별 입출고 추이 — GET /statistic/daily-inout */
export interface DailyInOut {
  date: string;
  inbound_qty: number;
  outbound_qty: number;
}

/** 재고 회전율 (월별) — GET /statistic/turnover */
export interface MonthlyTurnover {
  month: string;
  outbound_qty: number;
  average_inventory: number;
  turnover_rate: number;
}

/** 품번별 출고 순위 — GET /statistic/outbound-rank */
export interface SkuRanking {
  rank: number;
  product_id: string;
  sku: string;
  product_name: string;
  outbound_qty: number;
}

/** 재고 부족 알림 — GET /alert/low-stock */
export interface LowStockItem {
  product_id: string;
  sku: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  available_qty: number;
  min_stock_qty: number;
}
