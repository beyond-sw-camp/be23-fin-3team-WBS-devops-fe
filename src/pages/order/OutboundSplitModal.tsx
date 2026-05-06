import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Spin, Alert, Space, Typography, InputNumber, Select, Divider, Tag } from 'antd';
import { ThunderboltOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type {
  OutboundPreviewStoreGroup, SplitWarehouseAllocation,
} from '@/types/order';
import { useRecommendOutboundSplit } from '@/hooks/useOrderQuery';

const { Text } = Typography;

interface Props {
  open: boolean;
  storeGroup: OutboundPreviewStoreGroup | null;
  initialAllocations?: SplitWarehouseAllocation[];
  onClose: () => void;
  onConfirm: (allocations: SplitWarehouseAllocation[]) => void;
}

/**
 * 분할 출고 모달
 *   - 자동 추천 받기 (BE 그리디 알고리즘)
 *   - 수동 조정 가능 (창고별 행 추가/삭제, 수량 변경)
 *   - 합계 검증 (각 품목 합 == requiredQty)
 *   - [확인] 시 부모로 분배 결과 전달
 */
export default function OutboundSplitModal({
  open, storeGroup, initialAllocations, onClose, onConfirm,
}: Props) {
  const recommend = useRecommendOutboundSplit();
  /** 편집 중인 분배 — UI 의 source of truth */
  const [allocations, setAllocations] = useState<SplitWarehouseAllocation[]>([]);

  // 모달 열릴 때마다 초기화
  useEffect(() => {
    if (!open || !storeGroup) return;
    if (initialAllocations && initialAllocations.length > 0) {
      setAllocations(JSON.parse(JSON.stringify(initialAllocations)));
    } else {
      // 자동 추천 자동 호출
      recommend.mutate(
        { salesOrderIds: storeGroup.sales_order_ids, storeId: storeGroup.store_id },
        {
          onSuccess: (data) => setAllocations(JSON.parse(JSON.stringify(data.recommendations))),
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storeGroup?.store_id]);

  const allWarehouses = useMemo(() => {
    if (!storeGroup) return [];
    const map = new Map<string, string>();
    for (const r of storeGroup.requirements) {
      for (const w of r.warehouses) map.set(w.warehouse_id, w.warehouse_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [storeGroup]);

  // 품목별 합계 vs requiredQty 검증
  const validation = useMemo(() => {
    if (!storeGroup) return { valid: false, perProduct: [] as { productId: string; productName: string; required: number; allocated: number; diff: number }[] };
    const perProduct = storeGroup.requirements.map((req) => {
      const allocated = allocations.reduce((sum, wa) => {
        const pa = wa.product_allocations.find((p) => p.product_id === req.product_id);
        return sum + (pa?.qty ?? 0);
      }, 0);
      return {
        productId: req.product_id,
        productName: req.product_name,
        required: req.required_qty,
        allocated,
        diff: allocated - req.required_qty,
      };
    });
    const valid = perProduct.every((p) => p.diff === 0);
    return { valid, perProduct };
  }, [allocations, storeGroup]);

  if (!storeGroup) return null;

  // ── 액션 핸들러 ──
  const setQty = (whIdx: number, productId: string, qty: number) => {
    setAllocations((prev) => {
      const next = [...prev];
      const wa = { ...next[whIdx] };
      const idx = wa.product_allocations.findIndex((p) => p.product_id === productId);
      const newPas = [...wa.product_allocations];
      if (idx >= 0) {
        if (qty <= 0) newPas.splice(idx, 1);
        else newPas[idx] = { ...newPas[idx], qty };
      } else if (qty > 0) {
        newPas.push({ product_id: productId, qty });
      }
      wa.product_allocations = newPas;
      next[whIdx] = wa;
      return next;
    });
  };

  const changeWarehouse = (whIdx: number, newWhId: string) => {
    setAllocations((prev) => {
      const next = [...prev];
      next[whIdx] = { ...next[whIdx], warehouse_id: newWhId };
      return next;
    });
  };

  const addRow = () => {
    // 남은 창고 후보 중 첫 번째
    const used = new Set(allocations.map((a) => a.warehouse_id));
    const available = allWarehouses.find((w) => !used.has(w.value));
    if (!available) return;
    setAllocations((prev) => [...prev, { warehouse_id: available.value, product_allocations: [] }]);
  };

  const removeRow = (whIdx: number) => {
    setAllocations((prev) => prev.filter((_, i) => i !== whIdx));
  };

  const reRecommend = () => {
    recommend.mutate(
      { salesOrderIds: storeGroup.sales_order_ids, storeId: storeGroup.store_id },
      {
        onSuccess: (data) => setAllocations(JSON.parse(JSON.stringify(data.recommendations))),
      },
    );
  };

  return (
    <Modal
      title={`분할 출고 — ${storeGroup.store_name}`}
      open={open}
      onCancel={onClose}
      width={780}
      footer={[
        <Button key="re" onClick={reRecommend} loading={recommend.isPending}>
          <ThunderboltOutlined /> 자동 추천 다시
        </Button>,
        <Button key="cancel" onClick={onClose}>취소</Button>,
        <Button key="ok" type="primary" disabled={!validation.valid}
                onClick={() => onConfirm(allocations)}>
          확인 ({allocations.length}창고)
        </Button>,
      ]}
    >
      {recommend.isPending && allocations.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin tip="자동 추천 계산 중…" />
        </div>
      ) : (
        <>
          {/* 합계 검증 안내 */}
          <ValidationPanel perProduct={validation.perProduct} />

          {/* 분할 행들 */}
          <Divider style={{ margin: '12px 0' }}>창고별 분배</Divider>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {allocations.map((wa, whIdx) => (
              <div key={whIdx} style={{
                border: '1px solid #e5e7eb', borderRadius: 6, padding: 12,
                background: '#fafbfc',
              }}>
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Space>
                    <Text strong>창고</Text>
                    <Select
                      value={wa.warehouse_id}
                      onChange={(v) => changeWarehouse(whIdx, v)}
                      options={allWarehouses}
                      style={{ minWidth: 200 }}
                    />
                  </Space>
                  <Button danger type="text" icon={<DeleteOutlined />}
                          onClick={() => removeRow(whIdx)}>
                    행 삭제
                  </Button>
                </Space>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
                  {storeGroup.requirements.map((req) => {
                    const pa = wa.product_allocations.find((p) => p.product_id === req.product_id);
                    const stock = req.warehouses.find((w) => w.warehouse_id === wa.warehouse_id);
                    return (
                      <ProductAllocationRow
                        key={req.product_id}
                        productName={req.product_name}
                        required={req.required_qty}
                        availableInWarehouse={stock?.projected_qty ?? 0}
                        currentQty={pa?.qty ?? 0}
                        onChange={(q) => setQty(whIdx, req.product_id, q)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {allocations.length < allWarehouses.length && (
            <Button type="dashed" block icon={<PlusOutlined />} style={{ marginTop: 12 }}
                    onClick={addRow}>
              창고 추가
            </Button>
          )}
        </>
      )}
    </Modal>
  );
}

function ProductAllocationRow({
  productName, required, availableInWarehouse, currentQty, onChange,
}: {
  productName: string;
  required: number;
  availableInWarehouse: number;
  currentQty: number;
  onChange: (q: number) => void;
}) {
  return (
    <>
      <Text style={{ fontSize: 13 }}>{productName} <Text type="secondary" style={{ fontSize: 11 }}>(필요 {required})</Text></Text>
      <InputNumber
        min={0}
        max={Math.max(availableInWarehouse, currentQty)}
        value={currentQty}
        onChange={(v) => onChange(typeof v === 'number' ? v : 0)}
        style={{ width: 100 }}
      />
      <Text type="secondary" style={{ fontSize: 11 }}>
        / 가용 {availableInWarehouse}
      </Text>
    </>
  );
}

function ValidationPanel({
  perProduct,
}: {
  perProduct: { productId: string; productName: string; required: number; allocated: number; diff: number }[];
}) {
  const hasShortage = perProduct.some((p) => p.diff < 0);
  const hasOver = perProduct.some((p) => p.diff > 0);
  const valid = !hasShortage && !hasOver;

  return (
    <Alert
      type={valid ? 'success' : hasOver ? 'error' : 'warning'}
      showIcon
      message={valid ? '합계가 모두 정확합니다.' : hasOver ? '일부 품목이 초과 분배되었습니다.' : '일부 품목이 부족합니다.'}
      description={(
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {perProduct.map((p) => (
            <Tag
              key={p.productId}
              color={p.diff === 0 ? 'green' : p.diff > 0 ? 'red' : 'orange'}
              style={{ margin: 0 }}
            >
              {p.productName}: {p.allocated} / {p.required}
              {p.diff !== 0 && ` (${p.diff > 0 ? '+' : ''}${p.diff})`}
            </Tag>
          ))}
        </div>
      )}
    />
  );
}
