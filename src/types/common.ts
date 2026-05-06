export type AuditAction = '생성' | '조회' | '수정' | '삭제' | '승인' | '취소' | '완료' | '비활성화' | '로그인' | '로그인실패';
export type AuditModule = 'account' | 'master' | 'stock';
export type AuditService = 'account-service' | 'master-service' | 'stock-service';

export interface AuditLog {
  id: string;
  client_id: string;
  user_id: string;
  service_name: string | null;
  action: AuditAction | string;
  http_method: string;
  request_uri: string;
  entity_name: string;
  response_status: number;
  ip_address: string;
  duration_ms: number;
  created_at: string;
  /** 백엔드에서 null로 내려옴 — 프론트에서 사용자 목록과 조인 */
  user_name: string | null;
  /** BE 가 내려주는 요청 본문(JSON string). 수동 웨이브의 경우 선택된 지시서 UUID 목록이 담김. */
  request_body?: string | null;
}

export interface FileAttachmentItem {
  id: number;
  ref_type: string;
  ref_id: number | string;
  file_name: string;
  file_size: number;
  uploaded_at: string;
}
