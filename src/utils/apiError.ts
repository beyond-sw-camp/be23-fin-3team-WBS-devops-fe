import { AxiosError } from 'axios';

/**
 * 백엔드 에러 응답에서 사용자에게 보여줄 메시지를 추출한다.
 * Spring Boot 기본 응답 포맷과 커스텀 포맷 모두 처리.
 */
export function extractApiErrorMessage(err: unknown, fallback = '요청을 처리할 수 없습니다'): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (typeof data === 'string' && data.trim()) return data;
    if (data && typeof data === 'object') {
      const rec = data as Record<string, unknown>;
      if (typeof rec.error_message === 'string' && rec.error_message.trim()) return rec.error_message;
      if (typeof rec.message === 'string' && rec.message.trim()) return rec.message;
      if (typeof rec.error === 'string' && rec.error.trim() && rec.error !== 'Internal Server Error') return rec.error;
      if (typeof rec.detail === 'string' && rec.detail.trim()) return rec.detail;
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * 로케이션 수용량 초과 에러인지 판별.
 * BE 가 HTTP 422 + message="로케이션 수용량 초과 ..." 형식으로 내려줌.
 * (errorCode 분리 전이라 status + 텍스트로 식별)
 */
export function isCapacityExceededError(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return false;
  if (err.response?.status !== 422) return false;
  const data = err.response.data;
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    const code = typeof rec.errorCode === 'string' ? rec.errorCode : '';
    if (code === 'LOCATION_CAPACITY_EXCEEDED') return true;
    const msg = typeof rec.message === 'string' ? rec.message : '';
    if (msg.includes('로케이션 수용량 초과')) return true;
  }
  return true; // 422 자체를 capacity 초과 신호로 취급 (현재 BE 가 422 를 capacity 에만 사용)
}
