import { useMemo } from 'react';
import { Checkbox, Skeleton, Typography, Empty } from 'antd';
import { useQueries } from '@tanstack/react-query';
import { useOptionTypes } from '@/hooks/useMasterQuery';
import { getOptionValues } from '@/api/productOption';
import type { ProductOptionValue } from '@/api/productOption';

const { Text } = Typography;

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * 동적 옵션 섹션.
 * - 옵션 타입 N개를 BE에서 받아서 각 타입별 값 목록을 병렬 조회
 * - 사용자는 각 타입별 다중선택 (같은 타입 OR, 다른 타입 AND — BE가 자동 그룹화)
 */
export default function ProductSearchOptions({ value, onChange }: Props) {
  const { data: types = [], isLoading: loadingTypes } = useOptionTypes();

  const valueQueries = useQueries({
    queries: types.map((t) => ({
      queryKey: ['option-values', t.id] as const,
      queryFn: () => getOptionValues(t.id),
      staleTime: 60_000,
    })),
  });

  const valuesByType = useMemo(() => {
    const map = new Map<string, ProductOptionValue[]>();
    types.forEach((t, i) => {
      const q = valueQueries[i];
      if (q?.data) map.set(t.id, q.data);
    });
    return map;
  }, [types, valueQueries]);

  if (loadingTypes) return <Skeleton active paragraph={{ rows: 2 }} />;

  if (types.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="등록된 옵션 타입이 없습니다" />;
  }

  const selected = new Set(value);
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(Array.from(next));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 10, columnGap: 12, alignItems: 'baseline' }}>
      {types.map((t, i) => {
        const values = valuesByType.get(t.id) ?? [];
        const loading = valueQueries[i]?.isLoading;
        return (
          <RowFragment
            key={t.id}
            label={t.name}
            loading={loading}
            values={values}
            selected={selected}
            toggle={toggle}
          />
        );
      })}
    </div>
  );
}

function RowFragment({
  label,
  loading,
  values,
  selected,
  toggle,
}: {
  label: string;
  loading: boolean | undefined;
  values: ProductOptionValue[];
  selected: Set<string>;
  toggle: (id: string, checked: boolean) => void;
}) {
  return (
    <>
      <Text strong style={{ fontSize: 13 }}>{label}</Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {loading ? (
          <Skeleton.Input active size="small" />
        ) : values.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12 }}>등록된 값 없음</Text>
        ) : (
          values.map((v) => (
            <Checkbox
              key={v.id}
              checked={selected.has(v.id)}
              onChange={(e) => toggle(v.id, e.target.checked)}
            >
              {v.value}
            </Checkbox>
          ))
        )}
      </div>
    </>
  );
}
