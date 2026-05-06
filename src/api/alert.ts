import apiClient from './client';
import type { SoShortagePayload } from '@/stores/soShortageStore';

/**
 * SO 출고 불가 baseline 조회.
 *
 * WebSocket 채널 `/topic/admin/alerts/{clientId}` 의 added/resolved 이벤트는
 * 진입 시점부터의 변화만 받음. 페이지 진입/새로고침 시 현재 부족 SO 전체를 받아오려면
 * 이 endpoint 로 baseline 을 먼저 채우고 그 후에 WS 이벤트로 갱신.
 *
 * BE 응답: SalesOrderShortageAlertDto[] — WebSocket payload 와 동일 구조 (type 필드 없음).
 */
interface BeSoShortageAlert {
  salesOrderId: string;
  soNo: string;
  scheduledDate: string;
  storeName: string;
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    requiredQty: number;
    availableQty: number;
    shortageQty: number;
  }>;
}

export const getSoShortageBaseline = async (): Promise<SoShortagePayload[]> => {
  const res = await apiClient.get<BeSoShortageAlert[]>('/stock-service/alert/so-shortage');
  return (res.data ?? []).map((b) => ({
    salesOrderId: b.salesOrderId,
    soNo: b.soNo,
    scheduledDate: b.scheduledDate,
    storeName: b.storeName,
    items: (b.items ?? []).map((it) => ({
      productId: it.productId,
      productName: it.productName,
      sku: it.sku,
      requiredQty: it.requiredQty,
      availableQty: it.availableQty,
      shortageQty: it.shortageQty,
    })),
  }));
};
