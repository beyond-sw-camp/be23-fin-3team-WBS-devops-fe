import { useEffect, useState } from 'react';
import { Card } from 'antd';
import ProductSearchForm from './ProductSearchForm';
import { useProductSearchStorage } from './useProductSearchStorage';
import { EMPTY_CONDITION, type ProductSearchCondition, type ProductSearchFilterKey } from './types';

interface Props {
  enabledFilters?: ProductSearchFilterKey[];
  /** 적용 시 호출 — 부모가 condition으로 자체 결과 화면 갱신 */
  onApply: (condition: ProductSearchCondition) => void;
  title?: string;
}

/**
 * filter 모드 — 페이지 상단에 인라인으로 검색 폼만 노출.
 * 결과 테이블은 부모 페이지가 직접 렌더링한다.
 *
 * 마운트 시 저장된 조건이 있으면 즉시 부모에 통보(자동 적용).
 */
export default function ProductSearchInline({
  enabledFilters,
  onApply,
  title = '상품 조회조건',
}: Props) {
  const storage = useProductSearchStorage();
  const [condition, setCondition] = useState<ProductSearchCondition>(() => storage.load() ?? EMPTY_CONDITION);

  // 마운트 시 저장된 조건이 있으면 1회 자동 통보 (외부 시스템 동기화)
  useEffect(() => {
    if (Object.keys(condition).length > 0) onApply(condition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = (next: ProductSearchCondition) => {
    setCondition(next);
    storage.save(next);
    onApply(next);
  };

  const handleReset = () => {
    setCondition(EMPTY_CONDITION);
    storage.clear();
    onApply(EMPTY_CONDITION);
  };

  return (
    <Card size="small" title={title} styles={{ body: { padding: 12 } }}>
      <ProductSearchForm
        initialValue={condition}
        enabledFilters={enabledFilters}
        onApply={handleApply}
        onReset={handleReset}
      />
    </Card>
  );
}
