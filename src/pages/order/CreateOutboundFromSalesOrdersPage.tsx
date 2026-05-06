import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Typography, Steps, Button, Empty, Spin, Space, Tag, Switch, Input, DatePicker,
  App, Card, Divider, Checkbox, Tooltip, Result,
} from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, SearchOutlined, CheckCircleOutlined, LineChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type {
  ErpSalesOrder, ErpSalesOrderListFilter, SalesOrderProcessStatus,
  OutboundPreviewResponse, OutboundPreviewStoreGroup, SplitWarehouseAllocation,
} from '@/types/order';
import { useErpSalesOrders, useCreateOutboundFromSalesOrders } from '@/hooks/useOrderQuery';
import OutboundPreviewStep from './OutboundPreviewStep';
import OutboundSplitModal from './OutboundSplitModal';

const { Title, Text } = Typography;

type StepKey = 'select' | 'preview' | 'done';

const PROCESS_STATUS_TAG: Record<SalesOrderProcessStatus, { color: string; label: string }> = {
  NOT_STARTED: { color: 'default', label: '미처리' },
  PARTIAL:     { color: 'orange',  label: '부분' },
  COMPLETED:   { color: 'green',   label: '완료' },
};

type DateUrgency = 'DELAYED' | 'URGENT' | 'NORMAL';

/**
 * 출고예정일 강조도 판정
 *   DELAYED  - 마감 지난 (지연) → 빨강
 *   URGENT   - 7일 이내 마감 → 주황
 *   NORMAL   - 그 이후 → 강조 없음
 */
function dateUrgency(scheduledDate: string): DateUrgency {
  if (!scheduledDate) return 'NORMAL';
  const days = dayjs(scheduledDate).diff(dayjs().startOf('day'), 'day');
  if (days < 0) return 'DELAYED';
  if (days <= 7) return 'URGENT';
  return 'NORMAL';
}

function dDayLabel(scheduledDate: string): string {
  if (!scheduledDate) return '';
  const days = dayjs(scheduledDate).diff(dayjs().startOf('day'), 'day');
  if (days === 0) return 'D-DAY';
  if (days > 0) return `D-${days}`;
  return `D+${-days} (지연)`;
}

export default function CreateOutboundFromSalesOrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message, modal } = App.useApp();
  const createMutation = useCreateOutboundFromSalesOrders();

  // ── 진행률 페이지에서 "추가 출고지시서 생성" 진입 시 prefill ──
  const prefillSalesOrderIds = (location.state as { prefillSalesOrderIds?: string[] } | null)?.prefillSalesOrderIds;
  const prefillAppliedRef = useRef(false);

  // ── 진행 단계 ──
  const [currentStep, setCurrentStep] = useState<StepKey>('select');

  // ── Step 1: SO 선택 상태 ──
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** 첫 체크 시 잠긴 출고예정일 — 다른 날짜 비활성화 / 변경 시 확인 모달 */
  const [lockedDate, setLockedDate] = useState<string | null>(null);
  /** 펼친 SO id 집합 */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ── Step 2: 미리보기 + 창고 선택 + 분할 상태 ──
  const [previewData, setPreviewData] = useState<OutboundPreviewResponse | null>(null);
  /** storeId → 단일 창고 선택 */
  const [warehouseSelections, setWarehouseSelections] = useState<Record<string, string>>({});
  /** 분할 모드로 전환된 store id */
  const [splitStoreIds, setSplitStoreIds] = useState<Set<string>>(new Set());
  /** storeId → 분할 분배 결과 (모달에서 저장됨) */
  const [splitAllocations, setSplitAllocations] = useState<Record<string, SplitWarehouseAllocation[]>>({});

  // 분할 모달 상태
  const [splitModalGroup, setSplitModalGroup] = useState<OutboundPreviewStoreGroup | null>(null);

  // ── Step 3: 생성 결과 ──
  const [createdOutboundIds, setCreatedOutboundIds] = useState<string[]>([]);

  // ── Step 1: 필터 상태 ──
  const [filterStatus] = useState<'draft' | 'approved' | 'closed' | undefined>(undefined);
  const [filterStoreId] = useState<string | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [filterDateTo, setFilterDateTo] = useState<dayjs.Dayjs | null>(null);
  const [filterSoNo, setFilterSoNo] = useState('');
  const [hideCompleted, setHideCompleted] = useState(true);

  const filter: ErpSalesOrderListFilter = useMemo(() => ({
    status: filterStatus,
    store_id: filterStoreId,
    date_from: filterDateFrom?.format('YYYY-MM-DD'),
    date_to: filterDateTo?.format('YYYY-MM-DD'),
    so_no_keyword: filterSoNo.trim() || undefined,
    hide_completed: hideCompleted,
  }), [filterStatus, filterStoreId, filterDateFrom, filterDateTo, filterSoNo, hideCompleted]);

  const { data: salesOrders = [], isLoading } = useErpSalesOrders(filter);

  // 진행률 페이지에서 prefill 진입 — 수주서 자동 선택 + 미리보기 단계로 점프
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (!prefillSalesOrderIds || prefillSalesOrderIds.length === 0) return;
    if (salesOrders.length === 0) return;
    const matched = salesOrders.filter((so) => prefillSalesOrderIds.includes(so.id));
    if (matched.length === 0) return;
    prefillAppliedRef.current = true;
    setSelectedIds(matched.map((so) => so.id));
    setLockedDate(matched[0].scheduled_date);
    setCurrentStep('preview');
    // history state 초기화 — 새로고침/뒤로가기 시 prefill 재적용 방지
    navigate(location.pathname, { replace: true, state: null });
  }, [salesOrders, prefillSalesOrderIds, navigate, location.pathname]);

  // ── 출고예정일별 그룹핑 ──
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, ErpSalesOrder[]>();
    for (const so of salesOrders) {
      const key = so.scheduled_date || '미정';
      const arr = groups.get(key) ?? [];
      arr.push(so);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b));
  }, [salesOrders]);

  // ── 같은 날짜만 선택 가능 동작 ──
  const handleToggle = (so: ErpSalesOrder, checked: boolean) => {
    if (checked) {
      // 첫 체크
      if (selectedIds.length === 0) {
        setSelectedIds([so.id]);
        setLockedDate(so.scheduled_date);
        return;
      }
      // 이미 잠긴 날짜와 다름 → 확인 모달
      if (lockedDate && so.scheduled_date !== lockedDate) {
        modal.confirm({
          title: `${so.scheduled_date} 출고예정일로 변경하시겠어요?`,
          content: `현재 선택된 ${lockedDate} 수주서가 모두 해제됩니다.`,
          okText: '확인',
          cancelText: '취소',
          onOk: () => {
            setSelectedIds([so.id]);
            setLockedDate(so.scheduled_date);
          },
        });
        return;
      }
      // 같은 날짜 추가
      setSelectedIds((prev) => [...prev, so.id]);
    } else {
      // 해제
      const next = selectedIds.filter((id) => id !== so.id);
      setSelectedIds(next);
      if (next.length === 0) setLockedDate(null);
    }
  };

  const isRowDisabled = (so: ErpSalesOrder): boolean => {
    return !!lockedDate && so.scheduled_date !== lockedDate && !selectedIds.includes(so.id);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNext = () => {
    if (selectedIds.length === 0) {
      message.warning('수주서를 1건 이상 선택해주세요.');
      return;
    }
    setCurrentStep('preview');
  };

  const handleToggleSplit = (storeId: string, on: boolean) => {
    setSplitStoreIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(storeId); else next.delete(storeId);
      return next;
    });
  };

  /**
   * 출고지시서 생성 — 출고처별로 1번씩 호출 (BE 제약: 한 호출당 한 store)
   * 단일 모드면 선택한 창고에 100% 배치, 분할 모드면 모달 결과 사용.
   *
   * 정책: 한 출고처 호출이 실패해도 나머지는 계속 시도 (출고처 간 독립).
   *   끝에 부분 성공 결과를 모달로 명시.
   */
  const handleCreate = async () => {
    if (!previewData) return;

    // 검증
    const errors: string[] = [];
    const callsToMake: {
      storeId: string;
      storeName: string;
      salesOrderIds: string[];
      allocations: SplitWarehouseAllocation[];
    }[] = [];

    for (const group of previewData.store_groups) {
      const isSplit = splitStoreIds.has(group.store_id);
      if (isSplit) {
        const allocs = splitAllocations[group.store_id];
        if (!allocs || allocs.length === 0) {
          errors.push(`${group.store_name}: 분할 분배가 설정되지 않았습니다.`);
          continue;
        }
        callsToMake.push({ storeId: group.store_id, storeName: group.store_name, salesOrderIds: group.sales_order_ids, allocations: allocs });
      } else {
        const whId = warehouseSelections[group.store_id];
        if (!whId) {
          errors.push(`${group.store_name}: 출고 창고를 선택해주세요.`);
          continue;
        }
        // 단일 → productAllocations 자동 구성 (모든 품목 100% 이 창고에)
        const allocs: SplitWarehouseAllocation[] = [{
          warehouse_id: whId,
          product_allocations: group.requirements.map((r) => ({ product_id: r.product_id, qty: r.required_qty })),
        }];
        callsToMake.push({ storeId: group.store_id, storeName: group.store_name, salesOrderIds: group.sales_order_ids, allocations: allocs });
      }
    }

    if (errors.length > 0) {
      modal.warning({ title: '생성 불가', content: errors.join('\n') });
      return;
    }

    // 순차 호출 — 한 건 실패해도 다음 건 계속 시도 (출고처 간 독립)
    const createdIds: string[] = [];
    const failed: { storeName: string; reason: string }[] = [];
    for (const call of callsToMake) {
      try {
        const res = await createMutation.mutateAsync({
          sales_order_ids: call.salesOrderIds,
          warehouse_allocations: call.allocations,
        });
        createdIds.push(...res.outbound_order_ids);
      } catch (e) {
        const reason = (e as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message
          ?? (e as Error)?.message
          ?? '알 수 없는 오류';
        failed.push({ storeName: call.storeName, reason });
      }
    }

    // 모두 실패 — Step 3 진입 안 하고 모달만
    if (createdIds.length === 0 && failed.length > 0) {
      modal.error({
        title: '출고지시서 생성 실패',
        width: 520,
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>{failed.length}건 모두 실패했습니다.</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569' }}>
              {failed.map((f, i) => (
                <li key={i}><b>{f.storeName}</b>: {f.reason}</li>
              ))}
            </ul>
          </div>
        ),
      });
      return;
    }

    // 부분 성공 — 사용자에게 명시적 안내
    if (failed.length > 0) {
      modal.warning({
        title: `부분 성공 — ${callsToMake.length}건 중 ${createdIds.length}장 생성됨`,
        width: 520,
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>
              일부 출고처는 생성에 실패했습니다. 성공한 건은 정상적으로 출고지시서가 만들어졌습니다.
            </p>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>실패 ({failed.length}건):</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569' }}>
              {failed.map((f, i) => (
                <li key={i}><b>{f.storeName}</b>: {f.reason}</li>
              ))}
            </ul>
          </div>
        ),
      });
    } else {
      message.success(`출고지시서 ${createdIds.length}장이 생성되었습니다.`);
    }

    setCreatedOutboundIds(createdIds);
    setCurrentStep('done');
  };

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/order/outbound')}>
            출고지시서 목록
          </Button>
          <Title level={4} style={{ margin: 0 }}>출고지시서 생성</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>ERP 수주서 → 출고지시서 (다중 SO + 분할 지원)</Text>
        </Space>
      </div>

      <Steps
        current={currentStep === 'select' ? 0 : currentStep === 'preview' ? 1 : 2}
        size="small"
        style={{ marginBottom: 24, maxWidth: 720 }}
        items={[
          { title: '수주서 선택' },
          { title: '창고 선택 / 미리보기' },
          { title: '생성 완료' },
        ]}
      />

      {currentStep === 'select' && (
        <SelectStep
          loading={isLoading}
          groupedByDate={groupedByDate}
          selectedIds={selectedIds}
          lockedDate={lockedDate}
          expandedIds={expandedIds}
          onToggle={handleToggle}
          onToggleExpand={toggleExpand}
          isRowDisabled={isRowDisabled}
          // 필터
          filterDateFrom={filterDateFrom}
          filterDateTo={filterDateTo}
          filterSoNo={filterSoNo}
          hideCompleted={hideCompleted}
          onFilterDateFromChange={setFilterDateFrom}
          onFilterDateToChange={setFilterDateTo}
          onFilterSoNoChange={setFilterSoNo}
          onHideCompletedChange={setHideCompleted}
        />
      )}

      {currentStep === 'preview' && (
        <OutboundPreviewStep
          salesOrderIds={selectedIds}
          selections={warehouseSelections}
          onSelectionsChange={setWarehouseSelections}
          splitStoreIds={splitStoreIds}
          onToggleSplit={handleToggleSplit}
          splitAllocations={splitAllocations}
          onPreviewLoaded={setPreviewData}
          onOpenSplitModal={(g) => setSplitModalGroup(g)}
        />
      )}

      {currentStep === 'done' && (
        <Result
          status="success"
          icon={<CheckCircleOutlined />}
          title={`출고지시서 ${createdOutboundIds.length}장이 생성되었습니다`}
          subTitle="목록 화면에서 승인/피킹/출고확정 단계로 진행할 수 있어요."
          extra={[
            <Button key="list" type="primary" onClick={() => navigate('/order/outbound')}>
              출고지시서 목록
            </Button>,
            <Button key="more" onClick={() => {
              // 새로 만들기 — 상태 초기화
              setCurrentStep('select');
              setSelectedIds([]);
              setLockedDate(null);
              setExpandedIds(new Set());
              setPreviewData(null);
              setWarehouseSelections({});
              setSplitStoreIds(new Set());
              setSplitAllocations({});
              setCreatedOutboundIds([]);
            }}>
              계속 생성
            </Button>,
          ]}
        />
      )}

      {/* 분할 모달 */}
      <OutboundSplitModal
        open={!!splitModalGroup}
        storeGroup={splitModalGroup}
        initialAllocations={splitModalGroup ? splitAllocations[splitModalGroup.store_id] : undefined}
        onClose={() => setSplitModalGroup(null)}
        onConfirm={(allocs) => {
          if (!splitModalGroup) return;
          setSplitAllocations((prev) => ({ ...prev, [splitModalGroup.store_id]: allocs }));
          setSplitModalGroup(null);
        }}
      />

      {/* 푸터 */}
      {currentStep !== 'done' && (
        <div style={{
          position: 'sticky', bottom: 0, background: '#fff', padding: '12px 16px',
          borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between',
          marginTop: 16, gap: 8,
        }}>
          <div>
            {currentStep === 'preview' && (
              <Button icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep('select')}>
                이전
              </Button>
            )}
          </div>
          <Space>
            <Button onClick={() => navigate('/order/outbound')}>취소</Button>
            {currentStep === 'select' && (
              <Button type="primary" icon={<ArrowRightOutlined />} iconPosition="end"
                      disabled={selectedIds.length === 0}
                      onClick={handleNext}>
                선택 완료 ({selectedIds.length}건)
              </Button>
            )}
            {currentStep === 'preview' && (
              <Button type="primary" loading={createMutation.isPending}
                      onClick={handleCreate}>
                출고지시서 생성
              </Button>
            )}
          </Space>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Step 1: 수주서 선택
// ============================================================
function SelectStep({
  loading, groupedByDate, selectedIds, lockedDate, expandedIds,
  onToggle, onToggleExpand, isRowDisabled,
  filterDateFrom, filterDateTo, filterSoNo, hideCompleted,
  onFilterDateFromChange, onFilterDateToChange, onFilterSoNoChange, onHideCompletedChange,
}: {
  loading: boolean;
  groupedByDate: [string, ErpSalesOrder[]][];
  selectedIds: string[];
  lockedDate: string | null;
  expandedIds: Set<string>;
  onToggle: (so: ErpSalesOrder, checked: boolean) => void;
  onToggleExpand: (id: string) => void;
  isRowDisabled: (so: ErpSalesOrder) => boolean;
  filterDateFrom: dayjs.Dayjs | null;
  filterDateTo: dayjs.Dayjs | null;
  filterSoNo: string;
  hideCompleted: boolean;
  onFilterDateFromChange: (d: dayjs.Dayjs | null) => void;
  onFilterDateToChange: (d: dayjs.Dayjs | null) => void;
  onFilterSoNoChange: (v: string) => void;
  onHideCompletedChange: (v: boolean) => void;
}) {
  return (
    <>
      {/* 필터 영역 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size={12} wrap style={{ width: '100%' }}>
          <Input
            placeholder="수주번호 검색"
            prefix={<SearchOutlined />}
            value={filterSoNo}
            onChange={(e) => onFilterSoNoChange(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>출고예정일</Text>
            <DatePicker value={filterDateFrom} onChange={onFilterDateFromChange} placeholder="시작" />
            <Text type="secondary">~</Text>
            <DatePicker value={filterDateTo} onChange={onFilterDateToChange} placeholder="종료" />
          </Space>
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>처리 완료 숨기기</Text>
            <Switch size="small" checked={hideCompleted} onChange={onHideCompletedChange} />
          </Space>
        </Space>
      </Card>

      {lockedDate && (
        <div style={{
          background: '#fffbe6', border: '1px solid #faad14', borderRadius: 6,
          padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e',
        }}>
          <strong>{lockedDate}</strong> 출고예정일이 선택되었습니다.
          다른 날짜를 선택하려면 현재 선택을 해제하거나, 다른 날짜 항목을 클릭해 교체 확인을 해주세요.
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : groupedByDate.length === 0 ? (
        <Empty description="조건에 해당하는 수주서가 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groupedByDate.map(([date, orders]) => (
            <DateGroupCard
              key={date}
              date={date}
              orders={orders}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              isRowDisabled={isRowDisabled}
              onToggle={onToggle}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DateGroupCard({
  date, orders, selectedIds, expandedIds, isRowDisabled, onToggle, onToggleExpand,
}: {
  date: string;
  orders: ErpSalesOrder[];
  selectedIds: string[];
  expandedIds: Set<string>;
  isRowDisabled: (so: ErpSalesOrder) => boolean;
  onToggle: (so: ErpSalesOrder, checked: boolean) => void;
  onToggleExpand: (id: string) => void;
}) {
  const urgency = dateUrgency(date);
  const groupDisabled = orders.every(isRowDisabled);
  const dDayColor = urgency === 'DELAYED' ? '#dc2626' : urgency === 'URGENT' ? '#ea580c' : undefined;

  return (
    <Card
      size="small"
      title={(
        <Space>
          <span>📅 {date}</span>
          <Text style={{ fontSize: 12, color: dDayColor, fontWeight: dDayColor ? 600 : undefined }}>
            {dDayLabel(date)}
          </Text>
          {urgency === 'DELAYED' && <Tag color="red">지연</Tag>}
          {urgency === 'URGENT' && <Tag color="orange">마감 임박</Tag>}
          <Text type="secondary" style={{ fontSize: 12 }}>· 수주 {orders.length}건</Text>
        </Space>
      )}
      style={{
        opacity: groupDisabled ? 0.5 : 1,
        transition: 'opacity 0.2s',
      }}
      styles={{ body: { padding: 0 } }}
    >
      {orders.map((so, i) => {
        const isChecked = selectedIds.includes(so.id);
        const isDisabled = isRowDisabled(so);
        const isExpanded = expandedIds.has(so.id);
        const statusTag = PROCESS_STATUS_TAG[so.process_status];
        const previewText = so.item_preview.slice(0, 2).map((p) => `${p.product_name} ${p.qty}`).join(', ')
          + (so.item_count > 2 ? ` 외 ${so.item_count - 2}건` : '');

        return (
          <div key={so.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
            <div
              onClick={() => !isDisabled && onToggleExpand(so.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                background: isChecked ? '#e6f4ff' : 'transparent',
              }}
            >
              <Checkbox
                checked={isChecked}
                disabled={isDisabled}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onToggle(so, e.target.checked)}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Tag color={statusTag.color} style={{ margin: 0 }}>
                    {statusTag.label}
                    {so.process_status === 'PARTIAL' ? ` ${so.dispatch_progress_percent}%` : ''}
                  </Tag>
                  <Text strong style={{ fontSize: 13 }}>{so.so_no}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{so.store_name}</Text>
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {previewText} · 주문일 {so.order_date}
                </div>
              </div>
              <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                품목 {so.item_count}종 · 수량 {so.total_ordered_qty}
              </Text>
              {so.process_status !== 'NOT_STARTED' && (
                <Tooltip title="이 수주서의 진행률 페이지로 이동">
                  <Button
                    type="text"
                    size="small"
                    icon={<LineChartOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`/order/sales-orders/${so.id}/progress`, '_blank');
                    }}
                    style={{ color: '#1677ff' }}
                  >
                    진행률
                  </Button>
                </Tooltip>
              )}
            </div>

            {isExpanded && (
              <div style={{ padding: '8px 16px 16px 56px', background: '#fafafa' }}>
                <Divider style={{ margin: '0 0 8px' }} />
                <Text type="secondary" style={{ fontSize: 11 }}>품목 미리보기</Text>
                <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12 }}>
                  {so.item_preview.map((p) => (
                    <li key={p.product_id}>
                      {p.product_name} — {p.qty}개
                    </li>
                  ))}
                  {so.item_count > so.item_preview.length && (
                    <li style={{ color: '#94a3b8' }}>외 {so.item_count - so.item_preview.length}건…</li>
                  )}
                </ul>
                {so.process_status !== 'NOT_STARTED' && (
                  <Tooltip title="이 수주서의 진행률 페이지로 이동">
                    <Button type="link" size="small" style={{ paddingLeft: 0, marginTop: 4 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`/order/sales-orders/${so.id}/progress`, '_blank');
                            }}>
                      진행률 보기 →
                    </Button>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
