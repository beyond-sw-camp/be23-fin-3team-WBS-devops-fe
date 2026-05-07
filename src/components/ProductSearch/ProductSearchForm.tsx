import { useEffect, useMemo, useState } from 'react';
import {
  Input,
  Select,
  InputNumber,
  Cascader,
  Radio,
  Button,
  Checkbox,
  Divider,
  Typography,
  Space,
} from 'antd';
import type { DefaultOptionType } from 'antd/es/cascader';
import { useSuppliers } from '@/hooks/useMasterQuery';
import {
  getProductCategoryRoots,
  getProductCategoryChildren,
} from '@/api/productCategory';
import type { ProductCategory } from '@/api/productCategory';
import ProductSearchOptions from './ProductSearchOptions';
import {
  ALL_FILTER_KEYS,
  EMPTY_CONDITION,
  type ProductSearchCondition,
  type ProductSearchFilterKey,
} from './types';

const { Text } = Typography;

interface Props {
  initialValue: ProductSearchCondition;
  enabledFilters?: ProductSearchFilterKey[];
  onApply: (condition: ProductSearchCondition) => void;
  onReset: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

interface CascaderNode extends DefaultOptionType {
  value: string;
  label: string;
  isLeaf?: boolean;
  loading?: boolean;
  children?: CascaderNode[];
}

function categoryToNode(c: ProductCategory): CascaderNode {
  return {
    value: c.id,
    label: c.name,
    isLeaf: c.depth >= 2,
  };
}

export default function ProductSearchForm({
  initialValue,
  enabledFilters = ALL_FILTER_KEYS,
  onApply,
  onReset,
  onCancel,
  showCancel,
}: Props) {
  const enabled = useMemo(() => new Set(enabledFilters), [enabledFilters]);
  const [draft, setDraft] = useState<ProductSearchCondition>(initialValue);

  // 외부에서 initialValue가 바뀌면 (스토리지 로드 등) 동기화
  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);

  const update = <K extends keyof ProductSearchCondition>(
    key: K,
    val: ProductSearchCondition[K],
  ) => setDraft((prev) => ({ ...prev, [key]: val }));

  const { data: suppliers = [] } = useSuppliers();

  // ── 카테고리 캐스케이더 (lazy) ──
  const [cascaderOptions, setCascaderOptions] = useState<CascaderNode[]>([]);
  useEffect(() => {
    let canceled = false;
    getProductCategoryRoots()
      .then((roots) => {
        if (canceled) return;
        setCascaderOptions(roots.map(categoryToNode));
      })
      .catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, []);

  const loadCategoryChildren = async (selectedOptions: CascaderNode[]) => {
    const target = selectedOptions[selectedOptions.length - 1];
    target.loading = true;
    try {
      const children = await getProductCategoryChildren(target.value);
      target.children = children.map(categoryToNode);
      target.loading = false;
      // immer 없이 트리 재할당 → 새 참조로 리렌더
      setCascaderOptions((prev) => [...prev]);
    } catch {
      target.loading = false;
    }
  };

  const handleApply = () => {
    // 빈 문자열은 undefined로 정규화
    const normalized: ProductSearchCondition = {};
    Object.entries(draft).forEach(([k, v]) => {
      if (v === '' || v === null) return;
      if (Array.isArray(v) && v.length === 0) return;
      (normalized as Record<string, unknown>)[k] = v;
    });
    onApply(normalized);
  };

  const handleReset = () => {
    setDraft(EMPTY_CONDITION);
    onReset();
  };

  return (
    <div className="product-search-form">
      {/* 상단 토글 — 글로벌 적용은 항상 ON으로 단순화, SKU prefix만 노출 */}
      {enabled.has('sku') && (
        <Space size="middle" style={{ marginBottom: 12 }}>
          <Checkbox
            checked={!!draft.skuPrefix}
            onChange={(e) => update('skuPrefix', e.target.checked)}
          >
            상품코드 Prefix 적용
          </Checkbox>
        </Space>
      )}

      {/* 필드 그리드 — 3열 (label + input 1셀씩) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(220px, 1fr))',
          gap: '10px 16px',
          alignItems: 'center',
        }}
      >
        {enabled.has('sku') && (
          <Field label="상품코드">
            <Input
              size="small"
              placeholder={draft.skuPrefix ? '예: SKU- (앞부분)' : '예: SKU-1234'}
              value={draft.sku ?? ''}
              onChange={(e) => update('sku', e.target.value)}
              allowClear
            />
          </Field>
        )}
        {enabled.has('barcode') && (
          <Field label="바코드">
            <Input
              size="small"
              placeholder="13자리 입력 시 정확매칭"
              value={draft.barcode ?? ''}
              onChange={(e) => update('barcode', e.target.value)}
              allowClear
            />
          </Field>
        )}
        {enabled.has('name') && (
          <Field label="상품명">
            <Input
              size="small"
              value={draft.name ?? ''}
              onChange={(e) => update('name', e.target.value)}
              allowClear
            />
          </Field>
        )}
        {enabled.has('supplier') && (
          <Field label="입고처">
            <Select
              size="small"
              placeholder="전체"
              value={draft.supplierId}
              onChange={(v) => update('supplierId', v)}
              options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
            />
          </Field>
        )}
        {enabled.has('isActive') && (
          <Field label="상품상태">
            <Radio.Group
              size="small"
              value={draft.isActive === undefined ? 'all' : draft.isActive ? 'active' : 'inactive'}
              onChange={(e) => {
                const v = e.target.value;
                update('isActive', v === 'all' ? undefined : v === 'active');
              }}
            >
              <Radio.Button value="all">전체</Radio.Button>
              <Radio.Button value="active">활성</Radio.Button>
              <Radio.Button value="inactive">비활성</Radio.Button>
            </Radio.Group>
          </Field>
        )}
        {enabled.has('category') && (
          <Field label="카테고리">
            <Cascader
              size="small"
              options={cascaderOptions}
              loadData={loadCategoryChildren as (selectedOptions: DefaultOptionType[]) => void}
              changeOnSelect
              value={draft.categoryPath}
              onChange={(path, selectedOptions) => {
                const arr = (path ?? []) as string[];
                const labels = (selectedOptions ?? []).map((o) => String(o.label ?? ''));
                setDraft((prev) => ({
                  ...prev,
                  categoryPath: arr.length > 0 ? arr : undefined,
                  categoryId: arr.length > 0 ? arr[arr.length - 1] : undefined,
                  categoryPathLabels: labels.length > 0 ? labels : undefined,
                }));
              }}
              placeholder="대분류 → 중분류 → 소분류"
              allowClear
              style={{ width: '100%' }}
            />
          </Field>
        )}
        {enabled.has('ownerType') && (
          <Field label="소속">
            <Radio.Group
              size="small"
              value={draft.ownerType ?? 'all'}
              onChange={(e) => {
                const v = e.target.value;
                update('ownerType', v === 'all' ? undefined : v);
              }}
            >
              <Radio.Button value="all">전체</Radio.Button>
              <Radio.Button value="OWN">자사</Radio.Button>
              <Radio.Button value="PARTNER">위탁</Radio.Button>
            </Radio.Group>
          </Field>
        )}
        {enabled.has('price') && (
          <Field label="가격대">
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber
                size="small"
                placeholder="최소"
                value={draft.priceMin}
                onChange={(v) => update('priceMin', v ?? undefined)}
                min={0}
                style={{ width: '50%' }}
              />
              <InputNumber
                size="small"
                placeholder="최대"
                value={draft.priceMax}
                onChange={(v) => update('priceMax', v ?? undefined)}
                min={0}
                style={{ width: '50%' }}
              />
            </Space.Compact>
          </Field>
        )}
      </div>

      {/* 옵션 섹션 */}
      {enabled.has('options') && (
        <>
          <Divider style={{ margin: '16px 0 12px' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>옵션</Text>
          </Divider>
          <ProductSearchOptions
            value={draft.optionValueIds ?? []}
            onChange={(next) => update('optionValueIds', next)}
          />
        </>
      )}

      {/* 하단 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
        <Button type="primary" onClick={handleApply}>적용</Button>
        <Button onClick={handleReset}>초기화</Button>
        {showCancel && onCancel && <Button onClick={onCancel}>취소</Button>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 12, color: '#475569' }}>{label}</Text>
      <div>{children}</div>
    </div>
  );
}
