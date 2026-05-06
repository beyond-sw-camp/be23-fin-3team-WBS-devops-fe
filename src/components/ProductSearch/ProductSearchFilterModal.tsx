import { useState } from 'react';
import { Modal } from 'antd';
import ProductSearchForm from './ProductSearchForm';
import { useProductSearchStorage } from './useProductSearchStorage';
import { EMPTY_CONDITION, type ProductSearchCondition, type ProductSearchFilterKey } from './types';

interface Props {
  open: boolean;
  onCancel: () => void;
  enabledFilters?: ProductSearchFilterKey[];
  /** 적용 시 호출 — 부모가 condition으로 자체 결과 화면 갱신 */
  onApply: (condition: ProductSearchCondition) => void;
  title?: string;
}

/**
 * filter 모드 모달 — ProductSearchInline 의 모달 버전.
 * 결과 테이블은 모달 안에 두지 않고, 부모 페이지가 직접 렌더링한다.
 *
 * Body는 open=true일 때만 마운트되도록 분리 — useState 초기값으로 storage를 읽어
 * effect 동기화 코드를 회피한다.
 */
export default function ProductSearchFilterModal(props: Props) {
  const { open, onCancel, title = '상품 조회조건' } = props;

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={title}
      width={920}
      footer={null}
      destroyOnClose
    >
      {open && <ModalBody {...props} />}
    </Modal>
  );
}

function ModalBody({ onCancel, enabledFilters, onApply }: Props) {
  const storage = useProductSearchStorage();
  const [condition, setCondition] = useState<ProductSearchCondition>(() => storage.load() ?? EMPTY_CONDITION);

  const handleApply = (next: ProductSearchCondition) => {
    setCondition(next);
    storage.save(next);
    onApply(next);
    onCancel();
  };

  const handleReset = () => {
    setCondition(EMPTY_CONDITION);
    storage.clear();
    onApply(EMPTY_CONDITION);
  };

  return (
    <ProductSearchForm
      initialValue={condition}
      enabledFilters={enabledFilters}
      onApply={handleApply}
      onReset={handleReset}
      onCancel={onCancel}
      showCancel
    />
  );
}
