export type StatisticOrderType = 'inbound' | 'outbound' | 'transfer' | 'etc_in' | 'etc_out';

export interface StatisticOrderLink {
  id: string;
  order_no: string;
  type: StatisticOrderType;
}

/** 월별 입출고 추이 — GET /statistic/monthly-inout */
export interface MonthlyInOut {
  month: string;
  inbound_qty: number;
  outbound_qty: number;
  normal_inbound_qty: number;
  return_inbound_qty: number;
  normal_outbound_qty: number;
  return_outbound_qty: number;
  transfer_qty: number;
  etc_inbound_qty: number;
  etc_outbound_qty: number;
  adjustment_inbound_qty: number;
  adjustment_outbound_qty: number;
}

/** 일별 입출고 추이 — GET /statistic/daily-inout */
export interface DailyInOut {
  date: string;
  inbound_qty: number;
  outbound_qty: number;
  normal_inbound_qty: number;
  return_inbound_qty: number;
  normal_outbound_qty: number;
  return_outbound_qty: number;
  transfer_qty: number;
  etc_inbound_qty: number;
  etc_outbound_qty: number;
  adjustment_inbound_qty: number;
  adjustment_outbound_qty: number;
  inbound_orders: StatisticOrderLink[];
  outbound_orders: StatisticOrderLink[];
  transfer_orders: StatisticOrderLink[];
  etc_orders: StatisticOrderLink[];
  sku_list: string[];
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
