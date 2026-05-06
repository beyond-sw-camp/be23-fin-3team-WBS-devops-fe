import type { MessageInstance } from 'antd/es/message/interface';
import type { StompEventType, StompModule, WorkEventMessage } from '@/types/stomp';

/**
 * STOMP 이벤트 → 토스트 메시지 매핑.
 *
 * 페이지 핸들러는 invalidate (재조회 트리거) 만 하고, 토스트는 이 테이블이 결정한다.
 * 새 type 추가/문구 변경은 여기 한 곳만 수정하면 모든 페이지에 반영된다.
 *
 * `null` 항목 = 토스트 없음 (조용히 갱신만, 예: COUNTING 진행률).
 */

type ToastLevel = 'info' | 'success' | 'warning' | 'error';

interface ToastEntry {
  level: ToastLevel;
  text: (e: WorkEventMessage) => string;
}

type ModuleMap = Partial<Record<StompEventType, ToastEntry | null>>;

const orderNo = (e: WorkEventMessage) => e.orderNo ?? '-';

const MAP: Partial<Record<StompModule, ModuleMap>> = {
  inbound: {
    CREATED:        { level: 'info',    text: (e) => `${orderNo(e)} 입고지시서 생성` },
    CREATED_RETURN: { level: 'info',    text: (e) => `${orderNo(e)} 반품 입고지시서 생성` },
    APPROVED:       { level: 'success', text: (e) => `${orderNo(e)} 입고지시서 승인` },
    CANCELLED:      { level: 'warning', text: (e) => `${orderNo(e)} 입고지시서 취소` },
    RECEIVED:       { level: 'info',    text: (e) => `${orderNo(e)} 검수 완료` },
    PLACED:         null,  // 품목 단위 적치 — 상세 진행률 갱신만, 토스트 없음
    PARTIAL:        { level: 'warning', text: (e) => `${orderNo(e)} 부분 마감` },
    COMPLETED:      { level: 'success', text: (e) => `${orderNo(e)} 입고 완료` },
  },
  outbound: {
    CREATED:        { level: 'info',    text: (e) => `${orderNo(e)} 출고지시서 생성` },
    CREATED_RETURN: { level: 'info',    text: (e) => `${orderNo(e)} 반품 출고지시서 생성` },
    APPROVED:       { level: 'success', text: (e) => `${orderNo(e)} 출고지시서 승인` },
    CANCELLED:      { level: 'warning', text: (e) => `${orderNo(e)} 출고지시서 취소` },
    IN_PROGRESS:    { level: 'info',    text: (e) => `${orderNo(e)} 처리중 전환` },
    PARTIAL:        { level: 'warning', text: (e) => `${orderNo(e)} 부분 완료` },
    COMPLETED:      { level: 'success', text: (e) => `${orderNo(e)} 출고 완료` },
  },
  picking: {
    CREATED:   { level: 'info',    text: (e) => `${orderNo(e)} 피킹리스트 생성` },
    PICKED:    null,  // 품목 단위 피킹 — 진행률 갱신만, 토스트 없음 (스팸 방지)
    PARTIAL:   { level: 'warning', text: (e) => `${orderNo(e)} 부분 피킹` },
    COMPLETED: { level: 'success', text: (e) => `${orderNo(e)} 피킹 완료` },
  },
  transfer: {
    CREATED:   { level: 'info',    text: (e) => `${orderNo(e)} 이동지시서 생성` },
    APPROVED:  { level: 'success', text: (e) => `${orderNo(e)} 이동지시서 승인` },
    CANCELLED: { level: 'warning', text: (e) => `${orderNo(e)} 이동지시서 취소` },
    PARTIAL:   { level: 'warning', text: (e) => `${orderNo(e)} 부분 이동` },
    COMPLETED: { level: 'success', text: (e) => `${orderNo(e)} 이동 완료` },
  },
  'stock-count': {
    CREATED:   { level: 'info',    text: (e) => `${orderNo(e)} 실사지시서 생성` },
    STARTED:   { level: 'info',    text: (e) => `${orderNo(e)} 실사 시작` },
    COUNTING:  null,  // 진행률 갱신만 — 토스트 없음
    CANCELLED: { level: 'warning', text: (e) => `${orderNo(e)} 실사 취소` },
    COMPLETED: { level: 'success', text: (e) => `${orderNo(e)} 실사 마감` },
  },
};

/** module + type 으로 토스트 발송. 매핑 없으면 조용히 무시. */
export function showStompToast(
  messageApi: MessageInstance,
  event: WorkEventMessage,
): void {
  const moduleMap = MAP[event.module as StompModule];
  if (!moduleMap) return;
  const entry = moduleMap[event.type as StompEventType];
  if (!entry) return;
  messageApi[entry.level](entry.text(event));
}
