import { Button, Space, Tag } from 'antd';
import { SearchOutlined, CloseCircleFilled } from '@ant-design/icons';
import ProductSearchFilterModal from './ProductSearchFilterModal';
import ActiveConditionChips from './ActiveConditionChips';
import type { ProductSearchCondition, ProductSearchFilterKey } from './types';

interface CommonProps {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
  apply: (condition: ProductSearchCondition) => void;
  reset: () => void;
  condition: ProductSearchCondition;
  isFiltering: boolean;
  busy?: boolean;
  matchedProductCount?: number | null;
  filteredLineCount?: number;
  enabledFilters?: ProductSearchFilterKey[];
}

/**
 * 헤더 액션 영역에 두는 트리거 — "상품 검색" 버튼 + 모달.
 * 활성 시 버튼이 primary ghost로 강조되고, 작은 매칭 카운트만 옆에 붙는다.
 * 칩과 "초기화" 버튼은 별도 ProductFilterStatusBar로 본문 위에 둔다.
 */
export function ProductFilterTriggerButton({
  open,
  openModal,
  closeModal,
  apply,
  isFiltering,
  busy,
  matchedProductCount,
  enabledFilters,
}: CommonProps) {
  return (
    <>
      <Button
        icon={<SearchOutlined />}
        onClick={openModal}
        loading={busy}
        type={isFiltering ? 'primary' : 'default'}
        ghost={isFiltering}
      >
        상품 검색
        {isFiltering && typeof matchedProductCount === 'number' && (
          <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.85 }}>
            ({matchedProductCount.toLocaleString()})
          </span>
        )}
      </Button>
      <ProductSearchFilterModal
        open={open}
        onCancel={closeModal}
        onApply={apply}
        enabledFilters={enabledFilters}
      />
    </>
  );
}

/**
 * 본문 위에 두는 상태 표시 — 칩 나열 + 매칭/라인 카운트 + "초기화" 버튼.
 * 필터 미적용 상태에서는 아무것도 렌더하지 않는다 (null).
 */
export function ProductFilterStatusBar({
  apply,
  reset,
  condition,
  isFiltering,
  matchedProductCount,
  filteredLineCount,
}: CommonProps) {
  if (!isFiltering) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Space size={8} wrap>
        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
          필터 적용 중
          {typeof matchedProductCount === 'number' && ` · 매칭 상품 ${matchedProductCount.toLocaleString()}`}
          {typeof filteredLineCount === 'number' && ` · 라인 ${filteredLineCount.toLocaleString()}`}
        </Tag>
        <Button size="small" icon={<CloseCircleFilled />} onClick={reset}>
          필터 초기화
        </Button>
      </Space>
      <ActiveConditionChips
        condition={condition}
        onChange={apply}
        onClearAll={reset}
      />
    </div>
  );
}

/** 두 컴포넌트를 한 곳에 묶어 쓰는 래퍼 (이전 사용처 호환용). */
export default function ProductFilterButtonBar(props: CommonProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ProductFilterTriggerButton {...props} />
      <ProductFilterStatusBar {...props} />
    </div>
  );
}
