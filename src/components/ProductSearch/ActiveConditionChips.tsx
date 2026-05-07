import { useMemo } from 'react';
import { Tag, Button, Space, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useSuppliers } from '@/hooks/useMasterQuery';
import { useOptionTypes } from '@/hooks/useMasterQuery';
import { useQueries } from '@tanstack/react-query';
import { getOptionValues } from '@/api/productOption';
import type { ProductSearchCondition } from './types';

const { Text } = Typography;

interface Props {
  condition: ProductSearchCondition;
  onChange: (next: ProductSearchCondition) => void;
  onClearAll: () => void;
}

interface Chip {
  key: keyof ProductSearchCondition | string;
  label: string;
  /** 이 칩만 제거 시 호출 — undefined면 전체 초기화에만 영향 */
  onRemove?: () => void;
}

/**
 * 현재 적용된 검색 조건을 칩으로 나열.
 * 각 칩에 X 버튼으로 개별 제거, 우측에 "전체 초기화" 버튼.
 */
export default function ActiveConditionChips({ condition, onChange, onClearAll }: Props) {
  const { data: suppliers = [] } = useSuppliers();
  const { data: optionTypes = [] } = useOptionTypes();

  // 옵션 칩의 라벨을 위해 모든 옵션 값 로드 (옵션 타입별 병렬)
  const optionValueQueries = useQueries({
    queries: optionTypes.map((t) => ({
      queryKey: ['option-values', t.id] as const,
      queryFn: () => getOptionValues(t.id),
      staleTime: 60_000,
    })),
  });

  const optionValueLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    optionValueQueries.forEach((q) => {
      (q.data ?? []).forEach((v) => map.set(v.id, v.value));
    });
    return map;
  }, [optionValueQueries]);

  const supplierNameMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );

  const chips = useMemo<Chip[]>(() => {
    const arr: Chip[] = [];

    if (condition.keyword) {
      arr.push({
        key: 'keyword',
        label: `통합검색: ${condition.keyword}`,
        onRemove: () => onChange({ ...condition, keyword: undefined }),
      });
    }
    if (condition.sku) {
      arr.push({
        key: 'sku',
        label: `SKU${condition.skuPrefix ? '(prefix)' : ''}: ${condition.sku}`,
        onRemove: () => onChange({ ...condition, sku: undefined, skuPrefix: undefined }),
      });
    }
    if (condition.barcode) {
      arr.push({
        key: 'barcode',
        label: `바코드: ${condition.barcode}`,
        onRemove: () => onChange({ ...condition, barcode: undefined }),
      });
    }
    if (condition.name) {
      arr.push({
        key: 'name',
        label: `상품명: ${condition.name}`,
        onRemove: () => onChange({ ...condition, name: undefined }),
      });
    }
    if (condition.supplierId) {
      const name = supplierNameMap.get(condition.supplierId) ?? '선택됨';
      arr.push({
        key: 'supplierId',
        label: `입고처: ${name}`,
        onRemove: () => onChange({ ...condition, supplierId: undefined }),
      });
    }
    if (condition.categoryId) {
      const path = condition.categoryPathLabels?.length
        ? condition.categoryPathLabels.join(' > ')
        : '선택됨';
      arr.push({
        key: 'categoryId',
        label: `카테고리: ${path}`,
        onRemove: () =>
          onChange({
            ...condition,
            categoryId: undefined,
            categoryPath: undefined,
            categoryPathLabels: undefined,
          }),
      });
    }
    if (condition.ownerType) {
      arr.push({
        key: 'ownerType',
        label: `소속: ${condition.ownerType === 'OWN' ? '자사' : '위탁'}`,
        onRemove: () => onChange({ ...condition, ownerType: undefined }),
      });
    }
    if (condition.isActive !== undefined) {
      arr.push({
        key: 'isActive',
        label: `상태: ${condition.isActive ? '활성' : '비활성'}`,
        onRemove: () => onChange({ ...condition, isActive: undefined }),
      });
    }
    if (condition.priceMin !== undefined || condition.priceMax !== undefined) {
      const min = condition.priceMin?.toLocaleString() ?? '';
      const max = condition.priceMax?.toLocaleString() ?? '';
      arr.push({
        key: 'price',
        label: `가격: ${min}~${max}`,
        onRemove: () => onChange({ ...condition, priceMin: undefined, priceMax: undefined }),
      });
    }
    if (condition.optionValueIds && condition.optionValueIds.length > 0) {
      const labels = condition.optionValueIds.map((id) => optionValueLabelMap.get(id) ?? '').filter(Boolean);
      const display = labels.length > 0 ? labels.join(', ') : `${condition.optionValueIds.length}개`;
      arr.push({
        key: 'options',
        label: `옵션: ${display}`,
        onRemove: () => onChange({ ...condition, optionValueIds: undefined }),
      });
    }

    return arr;
  }, [condition, supplierNameMap, optionValueLabelMap, onChange]);

  if (chips.length === 0) return null;

  return (
    <Space wrap size={[6, 6]} style={{ width: '100%' }}>
      <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>현재 조건:</Text>
      {chips.map((c) => (
        <Tag
          key={String(c.key)}
          closable={!!c.onRemove}
          closeIcon={<CloseOutlined style={{ fontSize: 10 }} />}
          onClose={(e) => {
            e.preventDefault();
            c.onRemove?.();
          }}
          style={{ paddingInline: 8, paddingBlock: 2, fontSize: 12 }}
        >
          {c.label}
        </Tag>
      ))}
      <Button size="small" type="link" onClick={onClearAll} style={{ padding: 0 }}>
        전체 초기화
      </Button>
    </Space>
  );
}
