import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Product } from '@/types/product';
import { useSearchProductsAdvanced, useProductByBarcode } from '@/hooks/useMasterQuery';
import { EAN13_PATTERN, type ProductSearchCondition } from './types';

const { Text } = Typography;

interface Props {
  condition: ProductSearchCondition;
  multiple?: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[], rows: Product[]) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
}

/**
 * 검색 결과 테이블 — picker 모드에서 사용.
 * - 바코드가 EAN-13 13자리 숫자면 by-barcode 정확매칭 우선
 * - 그 외엔 search-advanced 사용
 */
export default function ProductSearchResult({
  condition,
  multiple = false,
  selectedIds,
  onSelectionChange,
  page,
  pageSize,
  onPageChange,
}: Props) {
  const barcodeIsExact = !!condition.barcode && EAN13_PATTERN.test(condition.barcode);

  const exact = useProductByBarcode(barcodeIsExact ? condition.barcode! : null);
  const advanced = useSearchProductsAdvanced(
    barcodeIsExact ? {} : condition,
    page,
    pageSize,
    { enabled: !barcodeIsExact },
  );

  const rows: Product[] = barcodeIsExact
    ? exact.data
      ? [exact.data]
      : []
    : advanced.data?.content ?? [];
  const total = barcodeIsExact ? rows.length : advanced.data?.totalElements ?? 0;
  const loading = barcodeIsExact ? exact.isFetching : advanced.isFetching;

  const columns: ColumnsType<Product> = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140, render: (v) => <Tag color="blue">{v}</Tag> },
    { title: '상품명', dataIndex: 'name', key: 'name' },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 140, render: (v) => v || <Text type="secondary">-</Text> },
    { title: '소속', dataIndex: 'owner_type', key: 'owner_type', width: 80, render: (v) => v === 'OWN' ? '자사' : '위탁' },
    {
      title: '기준가',
      dataIndex: 'standard_price',
      key: 'standard_price',
      width: 110,
      align: 'right',
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '상태',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 70,
      align: 'center',
      render: (v: boolean) => v ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag>,
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={rows}
      rowKey="id"
      size="small"
      loading={loading}
      pagination={
        barcodeIsExact
          ? false
          : {
              current: page + 1,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              onChange: (p, s) => onPageChange(p - 1, s),
              size: 'small',
            }
      }
      rowSelection={{
        type: multiple ? 'checkbox' : 'radio',
        selectedRowKeys: selectedIds,
        onChange: (keys, selectedRows) => onSelectionChange(keys as string[], selectedRows),
      }}
      onRow={(record) => ({
        onClick: () => {
          if (multiple) {
            const set = new Set(selectedIds);
            if (set.has(record.id)) set.delete(record.id);
            else set.add(record.id);
            onSelectionChange(Array.from(set), rows.filter((r) => set.has(r.id)));
          } else {
            onSelectionChange([record.id], [record]);
          }
        },
        style: { cursor: 'pointer' },
      })}
      scroll={{ y: 300 }}
    />
  );
}
