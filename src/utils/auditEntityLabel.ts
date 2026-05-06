/**
 * 감사 로그(audit log)의 entity_name 을 사용자 친화적 한국어 라벨로 변환.
 *
 * BE 가 영문 도메인 클래스/테이블명을 그대로 내려주기 때문에, 화면에 노출 시
 * 일반 사용자가 이해할 수 있는 이름으로 매핑해야 한다.
 *
 * 매칭 규칙 — 영문 lowercase 기준 (kebab-case, snake_case, camelCase 모두 대응).
 * 모르는 엔티티는 원본을 그대로 반환 (매핑이 빠진 항목 자연 노출).
 */
const ENTITY_LABEL: Record<string, string> = {
  // 계정 / 권한
  user: '사용자',
  role: '역할',
  permission: '권한',
  session: '세션',
  token: '토큰',

  // 마스터 — 상품
  product: '상품',
  productgroup: '상품 그룹',
  productcategory: '상품 카테고리',
  productoptiontype: '옵션 타입',
  productoptionvalue: '옵션 값',
  productoption: '상품 옵션',

  // 마스터 — 거래처
  supplier: '입고처',
  store: '출고처',

  // 마스터 — 창고
  warehouse: '창고',
  zone: '구역',
  rack: '랙',
  location: '로케이션',

  // 입고
  inbound: '입고',
  inboundorder: '입고 지시서',
  inboundorderitem: '입고 품목',
  inboundreceipt: '입고 전표',
  inboundreceiptitem: '입고 전표 품목',

  // 적치
  placement: '적치',
  placementorder: '적치 지시서',
  placementitem: '적치 항목',

  // 출고
  outbound: '출고',
  outboundorder: '출고 지시서',
  outboundorderitem: '출고 품목',
  outbounddispatch: '출고 전표',
  outbounddispatchitem: '출고 전표 품목',

  // 피킹
  picking: '피킹',
  pickinglist: '피킹 리스트',
  pickinglistitem: '피킹 항목',
  pickingitem: '피킹 항목',

  // 이동
  transfer: '이동',
  transferorder: '이동 지시서',
  transferorderitem: '이동 품목',

  // 실사
  stockcount: '재고 실사',
  stockcountorder: '재고 실사 지시서',
  stockcountitem: '재고 실사 항목',

  // 재고
  inventory: '재고',
  inventorystock: '재고',
  inventorytransaction: '재고 이력',

  // 기타 입출고
  etcinout: '기타 입출고',
  etcinoutorder: '기타 입출고 지시서',
  etcinoutitem: '기타 입출고 품목',

  // 시스템 / 부가
  notification: '알림',
  auditlog: '감사 로그',
  file: '파일',
  fileattachment: '파일 첨부',
  defectevidence: '불량 증빙',
  instructiondocument: '지시서 문서',
  developerclient: '개발자 회사',
  developer: '개발자',
};

/** entity_name 을 한국어로 변환. 매핑이 없으면 원본 반환. */
export function formatAuditEntity(name: string | null | undefined): string {
  if (!name) return '-';
  // kebab/snake/camel 모두 lowercase 단순화로 대응
  const key = name.replace(/[-_]/g, '').toLowerCase();
  return ENTITY_LABEL[key] ?? name;
}
