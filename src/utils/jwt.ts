/**
 * JWT 디코딩 유틸 — payload만 base64url 디코딩 (서명 검증 X, 클라이언트 표시용)
 *
 * 백엔드 JWT 페이로드:
 * {
 *   sub: string;          // user UUID
 *   clientId: string;     // company UUID (developer는 빈 문자열)
 *   isDeveloper: boolean; // 개발자 여부
 *   role: string;         // "ADMIN" | "MANAGER" | "OPERATOR" | "" (developer)
 *   iat: number;
 *   exp: number;
 * }
 */

export interface JwtPayload {
  sub: string;
  clientId?: string;
  isDeveloper?: boolean;
  role?: string;
  iat?: number;
  exp?: number;
}

export function decodeJwt(token: string | null | undefined): JwtPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** 현재 localStorage 토큰에서 payload 추출 */
export function getCurrentJwtPayload(): JwtPayload | null {
  if (typeof window === 'undefined') return null;
  return decodeJwt(localStorage.getItem('token'));
}

/** 현재 로그인 사용자의 clientId — STOMP destination 멀티테넌시 분리에 사용 */
export function getClientIdFromToken(): string | null {
  return getCurrentJwtPayload()?.clientId ?? null;
}

/** 현재 로그인 사용자의 userId — sub claim */
export function getUserIdFromToken(): string | null {
  return getCurrentJwtPayload()?.sub ?? null;
}
