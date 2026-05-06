import { useState } from 'react';
import { Modal, Button, Space, Divider } from 'antd';
import type { Product } from '@/types/product';
import ProductSearchForm from './ProductSearchForm';
import ProductSearchResult from './ProductSearchResult';
import { useProductSearchStorage } from './useProductSearchStorage';
import { EMPTY_CONDITION, type ProductSearchCondition, type ProductSearchFilterKey } from './types';

interface Props {
  open: boolean;
  onCancel: () => void;
  enabledFilters?: ProductSearchFilterKey[];
  multiple?: boolean;
  /** 선택 완료 콜백 — picker 모드의 핵심 출력 */
  onSelect: (products: Product[]) => void;
  title?: string;
}

/**
 * picker 모드 — 모달로 띄워 검색 후 1건 또는 다건 선택 → onSelect.
 *
 * Body는 open=true일 때만 마운트되도록 분리 — useState 초기값으로 storage를 읽어
 * effect 동기화 코드를 회피한다.
 */
export default function ProductSearchModal(props: Props) {
  const { open, onCancel, title = '상품 선택' } = props;

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={title}
      width={1100}
      footer={null}
      destroyOnClose
    >
      {open && <ModalBody {...props} />}
    </Modal>
  );
}

function ModalBody({
  onCancel,
  enabledFilters,
  multiple = false,
  onSelect,
}: Props) {
  const storage = useProductSearchStorage();
  const [condition, setCondition] = useState<ProductSearchCondition>(() => storage.load() ?? EMPTY_CONDITION);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<Product[]>([]);

  const handleApply = (next: ProductSearchCondition) => {
    setCondition(next);
    storage.save(next);
    setPage(0);
  };

  const handleReset = () => {
    setCondition(EMPTY_CONDITION);
    storage.clear();
    setPage(0);
    setSelectedIds([]);
    setSelectedRows([]);
  };

  const handleConfirm = () => {
    onSelect(selectedRows);
    onCancel();
  };

  return (
    <>
      <ProductSearchForm
        initialValue={condition}
        enabledFilters={enabledFilters}
        onApply={handleApply}
        onReset={handleReset}
        onCancel={onCancel}
        showCancel
      />

      <Divider style={{ margin: '16px 0 12px' }} />

      <ProductSearchResult
        condition={condition}
        multiple={multiple}
        selectedIds={selectedIds}
        onSelectionChange={(ids, rows) => {
          setSelectedIds(ids);
          setSelectedRows(rows);
        }}
        page={page}
        pageSize={pageSize}
        onPageChange={(p, s) => {
          setPage(p);
          setPageSize(s);
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Space>
          <Button onClick={onCancel}>취소</Button>
          <Button type="primary" disabled={selectedIds.length === 0} onClick={handleConfirm}>
            선택 ({selectedIds.length})
          </Button>
        </Space>
      </div>
    </>
  );
}
