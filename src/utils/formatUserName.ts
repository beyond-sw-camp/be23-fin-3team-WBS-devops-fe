/**
 * 사용자명 표시용 포맷터.
 * - null / undefined / 공백만으로 이루어진 문자열 → '-'
 * - 그 외 → 그대로 반환 (앞뒤 공백 제거)
 *
 * 백엔드가 createdByName 등을 null 로 내려주는 레거시 데이터 케이스에서 화면 깨짐 방지용.
 */
export function formatUserName(name: string | null | undefined, fallback = '-'): string {
  if (name == null) return fallback;
  const trimmed = name.trim();
  return trimmed.length === 0 ? fallback : trimmed;
}
