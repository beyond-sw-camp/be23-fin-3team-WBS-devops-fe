import type { Rule } from 'antd/es/form';

/**
 * 마스터 데이터(입고처/출고처/카테고리) 코드 입력 공통 검증 규칙.
 *
 * 백엔드 common/code/MasterCodePolicy 와 동일.
 * 이 코드들은 랙 번호·구역 번호·상품 SKU 등 다른 시스템 코드의 구성요소로 들어가므로
 * 짧고 의미있는 영문 식별자만 허용한다.
 *
 * - 공백 불가
 * - 영문 대문자, 숫자, 언더스코어(_), 하이픈(-) 만
 * - 길이 2~8자
 */
export const MASTER_CODE_PATTERN = /^[A-Z0-9_-]+$/;
export const MASTER_CODE_MIN = 2;
export const MASTER_CODE_MAX = 8;

export const MASTER_CODE_RULES: Rule[] = [
  { required: true, message: '코드를 입력하세요' },
  {
    pattern: MASTER_CODE_PATTERN,
    message: '코드는 영문 대문자/숫자/언더스코어/하이픈만 사용 가능합니다',
  },
  { min: MASTER_CODE_MIN, max: MASTER_CODE_MAX, message: `코드는 ${MASTER_CODE_MIN}~${MASTER_CODE_MAX}자여야 합니다` },
];

/** 라벨 옆에 보여줄 도움말 툴팁 텍스트 */
export const CODE_HELP = {
  partner: '이 코드는 랙 번호 등 다른 시스템 코드의 구성요소로 쓰입니다. 짧고 의미있는 영문 약어를 권장합니다 (예: LGX, TECH, FAST)',
  category: '이 코드는 구역 번호와 상품 SKU의 구성요소로 쓰입니다. 부모 카테고리 코드와 중복되지 않는 영문 식별자를 입력하세요 (예: ELEC, DISP, MONITOR)',
} as const;

