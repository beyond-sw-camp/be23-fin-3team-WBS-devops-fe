import { useEffect, useMemo, useState } from 'react';
import {
  Card, Tabs, Table, Tag, Spin, Empty, Alert, Radio, Space, Typography, Button, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExclamationCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type {
  OutboundPreviewResponse, OutboundPreviewStoreGroup, OutboundPreviewProductRequirement,
  OutboundPreviewWarehouseStock, StockStatus, SplitWarehouseAllocation,
} from '@/types/order';
import { usePreviewOutboundFromSalesOrders } from '@/hooks/useOrderQuery';

const { Text, Title } = Typography;

interface Props {
  salesOrderIds: string[];
  /** 사용자가 단일 창고를 골랐을 때 store 별 (storeId → warehouseId) */
  selections: Record<string, string>;
  onSelectionsChange: (next: Record<string, string>) => void;
  /** 사용자가 분할 모드로 전환한 store id 집합 */
  splitStoreIds: Set<string>;
  onToggleSplit: (storeId: string, on: boolean) => void;
  /** 수동 분할 결과 (storeId → 창고 분배 배열) — 분할 모달에서 저장됨 */
  splitAllocations: Record<string, SplitWarehouseAllocation[]>;
  /** 미리보기 응답이 도착하면 부모에 전달 — 분할 모달이 사용 */
  onPreviewLoaded: (preview: OutboundPreviewResponse) => void;
  /** 분할 모달 열기 요청 */
  onOpenSplitModal: (storeGroup: OutboundPreviewStoreGroup) => void;
}

const STOCK_STATUS_TAG: Record<StockStatus, { color: string; label: string }> = {
  SUFFICIENT: { color: 'green',   label: '충분' },
  SHORTAGE:   { color: 'orange',  label: '부족' },
  NONE:       { color: 'default', label: '없음' },
};

export default function OutboundPreviewStep({
  salesOrderIds, selections, onSelectionsChange,
  splitStoreIds, onToggleSplit, splitAllocations,
  onPreviewLoaded, onOpenSplitModal,
}: Props) {
  const previewMutation = usePreviewOutboundFromSalesOrders();
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);

  // mount 시 미리보기 호출
  useEffect(() => {
    if (salesOrderIds.length === 0) return;
    previewMutation.mutate(
      { salesOrderIds },
      {
        onSuccess: (data) => {
          onPreviewLoaded(data);
          // 첫 진입 시 추천 창고 자동 선택
          const next: Record<string, string> = {};
          for (const g of data.store_groups) {
            if (g.recommended_warehouse_id && !selections[g.store_id]) {
              next[g.store_id] = g.recommended_warehouse_id;
            }
          }
          if (Object.keys(next).length > 0) {
            onSelectionsChange({ ...selections, ...next });
          }
          // 첫 store 활성화
          if (data.store_groups.length > 0 && !activeStoreId) {
            setActiveStoreId(data.store_groups[0].store_id);
          }
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrderIds.join(',')]);

  const preview = previewMutation.data;

  if (previewMutation.isPending) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin tip="가용재고 계산 중…" />
      </div>
    );
  }
  if (previewMutation.isError) {
    return (
      <Alert
        type="error"
        message="미리보기 조회 실패"
        description={(previewMutation.error as Error)?.message ?? '잠시 후 다시 시도해주세요.'}
        action={(
          <Button onClick={() => previewMutation.mutate({ salesOrderIds })}>다시 시도</Button>
        )}
      />
    );
  }
  if (!preview || preview.store_groups.length === 0) {
    return <Empty description="미리보기 데이터가 없습니다." />;
  }

  const tabsItems = preview.store_groups.map((g) => ({
    key: g.store_id,
    label: (
      <Space size={6}>
        <span>{g.store_name}</span>
        <Tag style={{ margin: 0 }}>{g.sales_order_ids.length}건</Tag>
        {g.recommended_warehouse_id == null && !splitStoreIds.has(g.store_id) && (
          <Tooltip title="단일 창고로 충당 불가 — 분할 출고가 필요합니다.">
            <ExclamationCircleOutlined style={{ color: '#ea580c' }} />
          </Tooltip>
        )}
      </Space>
    ),
    children: (
      <StoreGroupView
        group={g}
        shipDate={preview.ship_date}
        selectedWarehouseId={selections[g.store_id]}
        onWarehouseChange={(whId) => onSelectionsChange({ ...selections, [g.store_id]: whId })}
        isSplitMode={splitStoreIds.has(g.store_id)}
        onToggleSplit={(on) => onToggleSplit(g.store_id, on)}
        splitAllocations={splitAllocations[g.store_id]}
        onOpenSplitModal={() => onOpenSplitModal(g)}
      />
    ),
  }));

  return (
    <Tabs
      activeKey={activeStoreId ?? undefined}
      onChange={setActiveStoreId}
      items={tabsItems}
    />
  );
}

// ============================================================
// 한 출고처(store) 묶음의 미리보기
// ============================================================
function StoreGroupView({
  group, shipDate, selectedWarehouseId, onWarehouseChange,
  isSplitMode, onToggleSplit, splitAllocations, onOpenSplitModal,
}: {
  group: OutboundPreviewStoreGroup;
  shipDate: string;
  selectedWarehouseId?: string;
  onWarehouseChange: (whId: string) => void;
  isSplitMode: boolean;
  onToggleSplit: (on: boolean) => void;
  splitAllocations?: SplitWarehouseAllocation[];
  onOpenSplitModal: () => void;
}) {
  // 모든 창고 ID 모음 (단일 라디오 옵션용)
  const allWarehouses = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of group.requirements) {
      for (const w of r.warehouses) map.set(w.warehouse_id, w.warehouse_name);
    }
    return Array.from(map.entries());
  }, [group]);

  // 사용자가 고른 창고가 모든 품목을 충당 가능한지
  const selectedCovers = useMemo(() => {
    if (!selectedWarehouseId) return false;
    return group.requirements.every((r) => {
      const w = r.warehouses.find((x) => x.warehouse_id === selectedWarehouseId);
      return w?.status === 'SUFFICIENT';
    });
  }, [selectedWarehouseId, group]);

  return (
    <div>
      {/* 헤더 — SO 정보 + 모드 전환 */}
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space size={16}>
            <Text strong>출고처: {group.store_name}</Text>
            <Text type="secondary">출고예정일: {shipDate}</Text>
            <Text type="secondary">수주서 {group.sales_order_ids.length}건</Text>
          </Space>
          <Radio.Group
            value={isSplitMode ? 'split' : 'single'}
            onChange={(e) => onToggleSplit(e.target.value === 'split')}
            optionType="button"
            size="small"
          >
            <Radio.Button value="single">단일 창고</Radio.Button>
            <Radio.Button value="split">분할 출고</Radio.Button>
          </Radio.Group>
        </Space>
      </Card>

      {/* 단일 창고 모드 — 추천/안내 + 라디오 + 품목 매트릭스 */}
      {!isSplitMode && (
        <>
          {group.recommended_warehouse_id ? (
            <Alert
              type="success"
              showIcon
              icon={<ThunderboltOutlined />}
              message={(
                <span>
                  추천 창고: <strong>{
                    allWarehouses.find(([id]) => id === group.recommended_warehouse_id)?.[1] ?? '-'
                  }</strong>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    모든 품목을 단일 창고에서 출고 가능
                  </Text>
                </span>
              )}
              style={{ marginBottom: 12 }}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="단일 창고로는 모든 수량을 충당할 수 없습니다."
              description="우측 상단 [분할 출고] 로 전환하거나, 가능한 한 창고 위주로 부분 출고해주세요."
              action={(
                <Button size="small" onClick={() => onToggleSplit(true)}>
                  분할 모드로 전환
                </Button>
              )}
              style={{ marginBottom: 12 }}
            />
          )}

          <div style={{ marginBottom: 8 }}>
            <Text strong style={{ fontSize: 13 }}>출고 창고 선택</Text>
            <div style={{ marginTop: 6 }}>
              <Radio.Group
                value={selectedWarehouseId}
                onChange={(e) => onWarehouseChange(e.target.value)}
              >
                <Space wrap>
                  {allWarehouses.map(([id, name]) => (
                    <Radio key={id} value={id}>{name}</Radio>
                  ))}
                </Space>
              </Radio.Group>
            </div>
            {selectedWarehouseId && !selectedCovers && (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 8 }}
                message="선택한 창고로는 일부 품목 수량이 부족합니다. 분할 출고를 사용하세요."
              />
            )}
          </div>

          {/* 품목별 매트릭스 */}
          {group.requirements.map((req) => (
            <ProductMatrix
              key={req.product_id}
              req={req}
              highlightedWarehouseId={selectedWarehouseId}
            />
          ))}
        </>
      )}

      {/* 분할 출고 모드 */}
      {isSplitMode && (
        <SplitSummary
          group={group}
          allocations={splitAllocations}
          onOpenModal={onOpenSplitModal}
        />
      )}
    </div>
  );
}

// ── 한 품목의 창고별 가용재고 표 ──
function ProductMatrix({
  req, highlightedWarehouseId,
}: {
  req: OutboundPreviewProductRequirement;
  highlightedWarehouseId?: string;
}) {
  const cols: ColumnsType<OutboundPreviewWarehouseStock> = [
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 180 },
    { title: '현재 가용', dataIndex: 'current_available_qty', key: 'curr', align: 'right', width: 110 },
    { title: '입고예정', dataIndex: 'incoming_qty', key: 'inc', align: 'right', width: 110 },
    { title: '다른 draft 점유', dataIndex: 'draft_reserved_qty', key: 'draft', align: 'right', width: 130 },
    { title: '예상 가용', dataIndex: 'projected_qty', key: 'proj', align: 'right', width: 110,
      render: (v: number) => <strong>{v}</strong> },
    {
      title: '상태', dataIndex: 'status', key: 'status', align: 'center', width: 90,
      render: (s: StockStatus) => {
        const t = STOCK_STATUS_TAG[s];
        return <Tag color={t.color} style={{ margin: 0 }}>{t.label}</Tag>;
      },
    },
  ];

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: 0 } }}
      title={(
        <Space>
          <Text strong>{req.product_name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{req.sku}</Text>
          <Tag color="blue" style={{ margin: 0 }}>필요 {req.required_qty}개</Tag>
        </Space>
      )}
    >
      <Table
        columns={cols}
        dataSource={req.warehouses}
        rowKey="warehouse_id"
        pagination={false}
        size="small"
        rowClassName={(r) => r.warehouse_id === highlightedWarehouseId ? 'preview-row-highlighted' : ''}
      />
      <style>{`
        .preview-row-highlighted { background: #e6f4ff !important; }
      `}</style>
    </Card>
  );
}

// ── 분할 모드 요약 ──
function SplitSummary({
  group, allocations, onOpenModal,
}: {
  group: OutboundPreviewStoreGroup;
  allocations?: SplitWarehouseAllocation[];
  onOpenModal: () => void;
}) {
  if (!allocations || allocations.length === 0) {
    return (
      <Card size="small" style={{ textAlign: 'center', padding: 24 }}>
        <Title level={5}>분할 출고 설정 필요</Title>
        <Text type="secondary">
          {group.store_name} 의 품목을 어느 창고에서 얼마씩 출고할지 정해주세요.
        </Text>
        <div style={{ marginTop: 16 }}>
          <Button type="primary" onClick={onOpenModal}>분할 분배 설정</Button>
        </div>
      </Card>
    );
  }

  // 이미 분배 완료 — 요약 표시
  return (
    <Card size="small" extra={<Button size="small" onClick={onOpenModal}>분배 수정</Button>}
          title={`분할 출고 ${allocations.length}창고로 분배`}>
      {allocations.map((wa) => {
        const whName = group.requirements
          .flatMap((r) => r.warehouses)
          .find((w) => w.warehouse_id === wa.warehouse_id)?.warehouse_name ?? '-';
        return (
          <div key={wa.warehouse_id} style={{ marginBottom: 8 }}>
            <Text strong>{whName}</Text>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {wa.product_allocations.map((pa) => {
                const pname = group.requirements
                  .find((r) => r.product_id === pa.product_id)?.product_name ?? '-';
                return <li key={pa.product_id}>{pname} — {pa.qty}개</li>;
              })}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}
