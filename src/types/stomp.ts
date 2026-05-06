/**
 * 백엔드가 publish 하는 작업 이벤트 (STOMP `/topic/admin/{module}/{clientId}` 등 채널 공통).
 *
 * destination 은 회사(clientId) 단위로 분리되며, payload 자체에도 clientId 가 박혀있다.
 * 페이지 핸들러는 module + type 으로 dispatch 하고, 토스트 매핑은 src/lib/stompMessages.ts 참조.
 */
export type StompModule =
  | 'inbound'
  | 'outbound'
  | 'picking'
  | 'transfer'
  | 'etc-inout'
  | 'stock-count';

export type StompEventType =
  // 공통 — 생성 / 승인 / 취소 / 진행
  | 'CREATED'
  | 'CREATED_RETURN'      // 반품 출고지시서 생성
  | 'APPROVED'
  | 'CANCELLED'
  | 'IN_PROGRESS'         // 웨이브 생성으로 처리중 전환 (outbound)
  // 모듈별 상세 진행 단계
  | 'RECEIVED'            // 입고검수 완료 (inbound)
  | 'PLACED'              // 적치 완료 (inbound)
  | 'PICKED'              // 품목 피킹됨 (picking, outbound)
  | 'DISPATCHED'          // 출고 분배 (outbound)
  // 실사 (stock-count)
  | 'STARTED'             // 실사 시작 (PDF 발행 시점)
  | 'COUNTING'            // 품목 실사 수량 입력 (상세만, 진행률 갱신용)
  // 마감
  | 'COMPLETED'
  | 'PARTIAL';

export interface WorkEventMessage {
  module: StompModule | string;
  type: StompEventType | string;
  /** 멀티테넌시 검증용 — destination 자체가 회사별로 분리되지만 payload 에도 박혀옴 */
  clientId?: string;
  orderId?: string;
  orderNo?: string;
  userId?: string;
  occurredAt?: string;
}

/** 기존 코드 호환용 별칭 — 기존에 `StompEvent` 로 import 하던 페이지들 */
export type StompEvent = WorkEventMessage;
