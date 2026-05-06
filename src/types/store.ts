/** 백엔드 master-service Store(출고처) 도메인 */
export interface Store {
  /** UUID */
  id: string;
  /** 비즈니스 식별자 (수동 입력, 예: CST-001 / STORE-001) */
  code: string;
  name: string;
  /** 사업자번호 — 백엔드 bizNo */
  business_no: string;
  /** 대표자명 */
  ceo_name: string | null;
  /** 전화번호 */
  tel: string;
  email: string;
  address: string;
  is_active: boolean;
  /** 자동 웨이브 생성 대상 — true 면 매일 07:00 스케줄러가 이 출고처의 OB 를 자동 웨이브 처리 */
  auto_wave_enabled: boolean;
}

/** Store 배송지 — 백엔드 store/address API 가 추가되면 실 BE 연동 */
export interface StoreAddress {
  id: string;
  store_id: string;
  name: string;
  receiver: string;
  phone: string;
  address: string;
  is_default: boolean;
}
