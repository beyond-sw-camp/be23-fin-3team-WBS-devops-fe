import type { InstructionDocumentType } from '@/types/instructionDocument';

/**
 * 본 프로젝트의 실제 라우트 구조에 맞춘 docType → 거래 상세 페이지 매핑.
 * 브리프의 가상 RESTy 경로(`/outbound-orders/...`)와는 다르므로 주의.
 *
 * - INBOUND_RECEIPT, OUTBOUND_DISPATCH는 각각 입고/출고 상세 페이지의 탭으로 통합돼 있어 같은 라우트로 보냄.
 * - ETC_INOUT_ORDER는 별도 상세 라우트가 없어 리스트 페이지로 보냄.
 */
const ROUTE_BUILDERS: Record<InstructionDocumentType, (sourceId: string) => string> = {
  OUTBOUND_ORDER: (id) => `/order/outbound/${id}`,
  OUTBOUND_DISPATCH: (id) => `/order/outbound/${id}`,
  INBOUND_ORDER: (id) => `/order/inbound/${id}`,
  INBOUND_RECEIPT: (id) => `/order/inbound/${id}`,
  PLACEMENT_ORDER: (id) => `/order/inbound/${id}/placement`,
  PICKING_LIST: (id) => `/order/picking/${id}`,
  TRANSFER_ORDER: (id) => `/order/transfer/${id}`,
  ETC_INOUT_ORDER: () => '/etc-inout',
  STOCK_COUNT_ORDER: (id) => `/inventory/stock-count/${id}`,
};

export function getInstructionDocumentRoute(docType: InstructionDocumentType, sourceId: string): string {
  return ROUTE_BUILDERS[docType](sourceId);
}
