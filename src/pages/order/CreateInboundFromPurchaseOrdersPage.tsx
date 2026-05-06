import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Steps, Button, Empty, Spin, Space, Tag, Input, DatePicker,
  App, Card, Divider, Checkbox, Result, Alert, Table, Tooltip,
} from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, SearchOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { AsnOrder, InboundOrder } from '@/types/order';
import type { AsnPreview, AsnPreviewItem, PoRecommendation, WarehouseCandidate } from '@/api/inbound';
import { getAsnPreview, recommendWarehousesForPos } from '@/api/inbound';
import { useAsnOrders, useCreateFromAsn } from '@/hooks/useInboundQuery';
import { useQueries, useQuery } from '@tanstack/react-query';

const { Title, Text } = Typography;

type StepKey = 'select' | 'preview' | 'done';

type DateUrgency = 'DELAYED' | 'URGENT' | 'NORMAL';

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

function urgencyColor(u: DateUrgency): string {
  if (u === 'DELAYED') return '#ef4444';
  if (u === 'URGENT') return '#f59e0b';
  return '#64748b';
}

export default function CreateInboundFromPurchaseOrdersPage() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const createFromAsn = useCreateFromAsn();

  const [currentStep, setCurrentStep] = useState<StepKey>('select');

  // Step 1: 선택
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lockedDate, setLockedDate] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Step 1: 필터
  const [filterDateFrom, setFilterDateFrom] = useState<Dayjs | null>(null);
  const [filterDateTo, setFilterDateTo] = useState<Dayjs | null>(null);
  const [filterAsnNo, setFilterAsnNo] = useState('');

  // Step 2: PO 별 선택된 창고 (asnId → warehouseId)
  const [warehouseSelections, setWarehouseSelections] = useState<Record<string, string>>({});

  // Step 3: 결과
  const [createdInbounds, setCreatedInbounds] = useState<InboundOrder[]>([]);

  const { data: asnOrders = [], isLoading } = useAsnOrders();

  // ── Step 2 진입 시 추천 창고 호출 ──
  // selectedIds 가 안정된 뒤에만 호출되도록 currentStep === 'preview' 조건.
  const recommendQuery = useQuery({
    queryKey: ['recommend-warehouses', selectedIds],
    queryFn: () => recommendWarehousesForPos(selectedIds),
    enabled: currentStep === 'preview' && selectedIds.length > 0,
    staleTime: 30_000,
  });

  // 추천 응답 도착 시 — 사용자가 아직 선택 안 한 PO 에 한해 recommended 창고 자동 prefill.
  // 이미 선택한 PO 는 사용자 선택 존중.
  useEffect(() => {
    const recs = recommendQuery.data?.recommendations;
    if (!recs || recs.length === 0) return;
    setWarehouseSelections((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const r of recs) {
        if (!next[r.purchase_order_id] && r.recommended_warehouse_id) {
          next[r.purchase_order_id] = r.recommended_warehouse_id;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [recommendQuery.data]);

  /** asnId → recommendation lookup */
  const recommendationByPoId = useMemo(() => {
    const map = new Map<string, PoRecommendation>();
    for (const r of recommendQuery.data?.recommendations ?? []) {
      map.set(r.purchase_order_id, r);
    }
    return map;
  }, [recommendQuery.data]);

  // ── 필터 적용 ──
  const filteredAsns = useMemo(() => {
    const kw = filterAsnNo.trim().toLowerCase();
    return asnOrders.filter((a) => {
      if (kw && !a.asn_no.toLowerCase().includes(kw) && !(a.vendor_name ?? '').toLowerCase().includes(kw)) return false;
      const d = a.expected_date;
      if (filterDateFrom && (!d || dayjs(d).isBefore(filterDateFrom, 'day'))) return false;
      if (filterDateTo && (!d || dayjs(d).isAfter(filterDateTo, 'day'))) return false;
      return true;
    });
  }, [asnOrders, filterAsnNo, filterDateFrom, filterDateTo]);

  // ── 입고예정일별 그룹핑 ──
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, AsnOrder[]>();
    for (const a of filteredAsns) {
      const key = a.expected_date || '미정';
      const arr = groups.get(key) ?? [];
      arr.push(a);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredAsns]);

  // ── 같은 날짜만 선택 가능 ──
  const handleToggle = (asn: AsnOrder, checked: boolean) => {
    if (checked) {
      if (selectedIds.length === 0) {
        setSelectedIds([asn.id]);
        setLockedDate(asn.expected_date);
        return;
      }
      if (lockedDate && asn.expected_date !== lockedDate) {
        modal.confirm({
          title: `${asn.expected_date} 입고예정일로 변경하시겠어요?`,
          content: `현재 선택된 ${lockedDate} 발주서가 모두 해제됩니다.`,
          okText: '확인',
          cancelText: '취소',
          onOk: () => {
            setSelectedIds([asn.id]);
            setLockedDate(asn.expected_date);
          },
        });
        return;
      }
      setSelectedIds((prev) => [...prev, asn.id]);
    } else {
      const next = selectedIds.filter((id) => id !== asn.id);
      setSelectedIds(next);
      if (next.length === 0) setLockedDate(null);
    }
  };

  const isRowDisabled = (asn: AsnOrder): boolean => {
    return !!lockedDate && asn.expected_date !== lockedDate && !selectedIds.includes(asn.id);
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
      message.warning('발주서를 1건 이상 선택해주세요.');
      return;
    }
    setCurrentStep('preview');
  };

  // ── 입고지시서 생성 — 선택된 PO마다 1번씩 호출 ──
  // 정책: 한 건 실패해도 다른 건은 계속 시도 (PO 들이 서로 독립이므로 한 건 실패가 다른 건에 영향 X).
  // 끝에 부분 성공 결과를 모달로 명시 — "성공 N장 / 실패 M장 + 사유" 보여줌.
  const handleCreate = async () => {
    const validationErrors: string[] = [];
    for (const id of selectedIds) {
      if (!warehouseSelections[id]) {
        const asn = asnOrders.find((a) => a.id === id);
        validationErrors.push(`${asn?.asn_no ?? id}: 창고를 선택해주세요.`);
      }
    }
    if (validationErrors.length > 0) {
      modal.warning({ title: '생성 불가', content: validationErrors.join('\n') });
      return;
    }

    const created: InboundOrder[] = [];
    const failed: { asnNo: string; reason: string }[] = [];

    for (const id of selectedIds) {
      try {
        const result = await createFromAsn.mutateAsync({
          asnId: id,
          warehouse: warehouseSelections[id],
        });
        created.push(result);
      } catch (e) {
        const asn = asnOrders.find((a) => a.id === id);
        const reason = (e as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message
          ?? (e as Error)?.message
          ?? '알 수 없는 오류';
        failed.push({ asnNo: asn?.asn_no ?? id, reason });
      }
    }

    // 모두 실패한 경우 — Step 3 진입 안 하고 모달만 띄우고 머무르기
    if (created.length === 0 && failed.length > 0) {
      modal.error({
        title: '입고지시서 생성 실패',
        width: 520,
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>{failed.length}건 모두 실패했습니다.</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569' }}>
              {failed.map((f, i) => (
                <li key={i}><b>{f.asnNo}</b>: {f.reason}</li>
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
        title: `부분 성공 — ${selectedIds.length}장 중 ${created.length}장 생성됨`,
        width: 520,
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>
              일부 발주서는 생성에 실패했습니다. 성공한 건은 정상적으로 입고지시서가 만들어졌습니다.
            </p>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>실패 ({failed.length}건):</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569' }}>
              {failed.map((f, i) => (
                <li key={i}><b>{f.asnNo}</b>: {f.reason}</li>
              ))}
            </ul>
          </div>
        ),
      });
    } else {
      message.success(`입고지시서 ${created.length}장이 생성되었습니다.`);
    }

    setCreatedInbounds(created);
    setCurrentStep('done');
  };

  const reset = () => {
    setCurrentStep('select');
    setSelectedIds([]);
    setLockedDate(null);
    setExpandedIds(new Set());
    setWarehouseSelections({});
    setCreatedInbounds([]);
  };

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/order/inbound')}>
            입고지시서 목록
          </Button>
          <Title level={4} style={{ margin: 0 }}>입고지시서 생성</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>ERP 발주서 → 입고지시서</Text>
        </Space>
      </div>

      <Steps
        current={currentStep === 'select' ? 0 : currentStep === 'preview' ? 1 : 2}
        size="small"
        style={{ marginBottom: 24, maxWidth: 720 }}
        items={[
          { title: '발주서 선택' },
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
          filterDateFrom={filterDateFrom}
          filterDateTo={filterDateTo}
          filterAsnNo={filterAsnNo}
          onFilterDateFromChange={setFilterDateFrom}
          onFilterDateToChange={setFilterDateTo}
          onFilterAsnNoChange={setFilterAsnNo}
        />
      )}

      {currentStep === 'preview' && (
        <PreviewStep
          selectedAsns={asnOrders.filter((a) => selectedIds.includes(a.id))}
          recommendationByPoId={recommendationByPoId}
          recommendLoading={recommendQuery.isLoading}
          warehouseSelections={warehouseSelections}
          onWarehouseChange={(asnId, whId) =>
            setWarehouseSelections((prev) => ({ ...prev, [asnId]: whId }))
          }
        />
      )}

      {currentStep === 'done' && (
        <Result
          status={createdInbounds.length === selectedIds.length ? 'success' : 'warning'}
          icon={<CheckCircleOutlined />}
          title={
            createdInbounds.length === selectedIds.length
              ? `입고지시서 ${createdInbounds.length}장이 생성되었습니다`
              : `${selectedIds.length}장 중 ${createdInbounds.length}장 생성됨`
          }
          subTitle="목록 화면에서 승인/검수/적치 단계로 진행할 수 있어요."
          extra={[
            <Button key="list" type="primary" onClick={() => navigate('/order/inbound')}>
              입고지시서 목록
            </Button>,
            <Button key="more" onClick={reset}>
              계속 생성
            </Button>,
          ]}
        />
      )}

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
            <Button onClick={() => navigate('/order/inbound')}>취소</Button>
            {currentStep === 'select' && (
              <Button type="primary" icon={<ArrowRightOutlined />} iconPosition="end"
                      disabled={selectedIds.length === 0}
                      onClick={handleNext}>
                선택 완료 ({selectedIds.length}건)
              </Button>
            )}
            {currentStep === 'preview' && (
              <Button type="primary" loading={createFromAsn.isPending}
                      onClick={handleCreate}>
                입고지시서 생성
              </Button>
            )}
          </Space>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Step 1: 발주서 선택
// ============================================================
function SelectStep({
  loading, groupedByDate, selectedIds, lockedDate, expandedIds,
  onToggle, onToggleExpand, isRowDisabled,
  filterDateFrom, filterDateTo, filterAsnNo,
  onFilterDateFromChange, onFilterDateToChange, onFilterAsnNoChange,
}: {
  loading: boolean;
  groupedByDate: [string, AsnOrder[]][];
  selectedIds: string[];
  lockedDate: string | null;
  expandedIds: Set<string>;
  onToggle: (asn: AsnOrder, checked: boolean) => void;
  onToggleExpand: (id: string) => void;
  isRowDisabled: (asn: AsnOrder) => boolean;
  filterDateFrom: Dayjs | null;
  filterDateTo: Dayjs | null;
  filterAsnNo: string;
  onFilterDateFromChange: (d: Dayjs | null) => void;
  onFilterDateToChange: (d: Dayjs | null) => void;
  onFilterAsnNoChange: (s: string) => void;
}) {
  return (
    <>
      {/* 필터 */}
      <Card size="small" style={{ marginBottom: 12, border: '1px solid #e5e7eb' }} styles={{ body: { padding: 12 } }}>
        <Space size={12} wrap>
          <Input
            placeholder="발주번호 또는 입고처명"
            prefix={<SearchOutlined />}
            value={filterAsnNo}
            onChange={(e) => onFilterAsnNoChange(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>입고예정일</Text>
            <DatePicker value={filterDateFrom} onChange={onFilterDateFromChange} placeholder="시작" style={{ width: 130 }} />
            <Text type="secondary">~</Text>
            <DatePicker value={filterDateTo} onChange={onFilterDateToChange} placeholder="종료" style={{ width: 130 }} />
          </Space>
        </Space>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : groupedByDate.length === 0 ? (
        <Empty description="조건에 맞는 발주서가 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groupedByDate.map(([date, asns]) => (
            <DateGroupCard
              key={date}
              date={date}
              asns={asns}
              selectedIds={selectedIds}
              lockedDate={lockedDate}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onToggleExpand={onToggleExpand}
              isRowDisabled={isRowDisabled}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DateGroupCard({
  date, asns, selectedIds, lockedDate, expandedIds, onToggle, onToggleExpand, isRowDisabled,
}: {
  date: string;
  asns: AsnOrder[];
  selectedIds: string[];
  lockedDate: string | null;
  expandedIds: Set<string>;
  onToggle: (asn: AsnOrder, checked: boolean) => void;
  onToggleExpand: (id: string) => void;
  isRowDisabled: (asn: AsnOrder) => boolean;
}) {
  const urg = dateUrgency(date);
  const dDay = dDayLabel(date);
  const groupLocked = !!lockedDate && date !== lockedDate;

  return (
    <Card
      size="small"
      style={{
        border: `1px solid ${groupLocked ? '#e5e7eb' : urgencyColor(urg) + '40'}`,
        opacity: groupLocked ? 0.55 : 1,
      }}
      styles={{ body: { padding: 0 } }}
      title={
        <Space size={10}>
          <Text strong style={{ fontSize: 14, color: '#0f172a' }}>{date}</Text>
          {dDay && (
            <Tag color={urg === 'DELAYED' ? 'red' : urg === 'URGENT' ? 'orange' : 'default'}>
              {dDay}
            </Tag>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>발주서 {asns.length}건</Text>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {asns.map((asn, idx) => {
          const checked = selectedIds.includes(asn.id);
          const disabled = isRowDisabled(asn);
          const expanded = expandedIds.has(asn.id);
          const totalQty = asn.items.reduce((s, i) => s + i.qty, 0);
          return (
            <div
              key={asn.id}
              style={{
                borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9',
                padding: '10px 12px',
                background: checked ? '#f0f9ff' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) => onToggle(asn, e.target.checked)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={10}>
                    <Text strong style={{ fontSize: 13 }}>{asn.asn_no}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>·</Text>
                    <Text style={{ fontSize: 13 }}>{asn.vendor_name}</Text>
                  </Space>
                  <div style={{ marginTop: 2 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      품목 {asn.items.length}종 · 총 {totalQty.toLocaleString()}개
                      {asn.ship_date && ` · 출하 ${asn.ship_date}`}
                    </Text>
                  </div>
                </div>
                <Button size="small" type="link" onClick={() => onToggleExpand(asn.id)}>
                  {expanded ? '접기' : '품목 보기'}
                </Button>
              </div>
              {expanded && (
                <div style={{ marginTop: 8, paddingLeft: 32 }}>
                  <Table
                    size="small"
                    pagination={false}
                    dataSource={asn.items}
                    rowKey={(_, i) => `${asn.id}-${i}`}
                    columns={[
                      { title: 'SKU', dataIndex: 'sku', width: 140 },
                      { title: '상품명', dataIndex: 'product_name' },
                      { title: '수량', dataIndex: 'qty', align: 'right', width: 90,
                        render: (v: number) => v.toLocaleString() },
                      { title: '단가', dataIndex: 'unit_price', align: 'right', width: 100,
                        render: (v: number) => v?.toLocaleString() ?? '-' },
                    ]}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============================================================
// Step 2: 미리보기 + 창고 선택 (추천 기반)
// ============================================================
function PreviewStep({
  selectedAsns, recommendationByPoId, recommendLoading,
  warehouseSelections, onWarehouseChange,
}: {
  selectedAsns: AsnOrder[];
  recommendationByPoId: Map<string, PoRecommendation>;
  recommendLoading: boolean;
  warehouseSelections: Record<string, string>;
  onWarehouseChange: (asnId: string, whId: string) => void;
}) {
  // 각 PO의 품목 미리보기 (등록 여부 매칭) 병렬 로드 — 추천과는 별도 endpoint
  const previewQueries = useQueries({
    queries: selectedAsns.map((asn) => ({
      queryKey: ['asn-preview', asn.id],
      queryFn: () => getAsnPreview(asn.id),
      staleTime: 60_000,
    })),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {selectedAsns.map((asn, idx) => {
        const previewQuery = previewQueries[idx];
        return (
          <PoPreviewCard
            key={asn.id}
            asn={asn}
            preview={previewQuery.data}
            previewLoading={previewQuery.isLoading}
            recommendation={recommendationByPoId.get(asn.id)}
            recommendLoading={recommendLoading}
            selectedWarehouseId={warehouseSelections[asn.id]}
            onWarehouseChange={(whId) => onWarehouseChange(asn.id, whId)}
          />
        );
      })}
    </div>
  );
}

function PoPreviewCard({
  asn, preview, previewLoading,
  recommendation, recommendLoading,
  selectedWarehouseId, onWarehouseChange,
}: {
  asn: AsnOrder;
  preview: AsnPreview | undefined;
  previewLoading: boolean;
  recommendation: PoRecommendation | undefined;
  recommendLoading: boolean;
  selectedWarehouseId: string | undefined;
  onWarehouseChange: (whId: string) => void;
}) {
  const totalQty = asn.items.reduce((s, i) => s + i.qty, 0);
  const recommendedId = recommendation?.recommended_warehouse_id ?? null;
  const candidates = recommendation?.candidates ?? [];

  return (
    <Card
      size="small"
      style={{ border: '1px solid #e5e7eb' }}
      styles={{ body: { padding: 14 } }}
      title={
        <Space size={10} wrap>
          <Text strong style={{ fontSize: 14 }}>{asn.asn_no}</Text>
          <Text type="secondary">·</Text>
          <Text style={{ fontSize: 13 }}>{asn.vendor_name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>입고예정 {asn.expected_date}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            품목 {asn.items.length}종 · 총 {totalQty.toLocaleString()}개
          </Text>
        </Space>
      }
    >
      {previewLoading || !preview ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin /> <Text type="secondary" style={{ marginLeft: 8 }}>품목 미리보기 로딩…</Text>
        </div>
      ) : (
        <>
          {!preview.all_matched && (
            <Alert
              type="error"
              showIcon
              message="미등록 상품이 포함되어 있어 입고지시서 생성이 차단됩니다."
              description="이 발주서를 생성하려면 마스터에 해당 상품을 먼저 등록해주세요."
              style={{ marginBottom: 10 }}
            />
          )}
          <Table
            size="small"
            pagination={false}
            dataSource={preview.items}
            rowKey={(_, i) => `${asn.id}-prev-${i}`}
            columns={[
              {
                title: 'SKU',
                dataIndex: 'sku',
                width: 140,
                render: (v: string | null, r: AsnPreviewItem) => (
                  <Space size={6}>
                    <span>{v ?? '-'}</span>
                    {!r.matched && <Tag color="red">미등록</Tag>}
                  </Space>
                ),
              },
              { title: '상품명', dataIndex: 'product_name', render: (v: string | null) => v ?? '-' },
              { title: '수량', dataIndex: 'qty', align: 'right', width: 90,
                render: (v: number) => v.toLocaleString() },
              { title: '단가', dataIndex: 'unit_price', align: 'right', width: 110,
                render: (v: number | null) => v?.toLocaleString() ?? '-' },
            ]}
            style={{ marginBottom: 12 }}
          />
        </>
      )}

      <Divider style={{ margin: '8px 0 12px' }} />

      <div>
        <Space size={6} align="center" style={{ marginBottom: 8 }}>
          <ThunderboltOutlined style={{ color: '#f59e0b' }} />
          <Text strong style={{ fontSize: 13, color: '#0f172a' }}>입고 창고 선택</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            협력사 전용 랙 + 카테고리 매칭 zone 기반 추천. 다른 창고도 자유 선택 가능.
          </Text>
        </Space>

        {recommendLoading && candidates.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <Spin size="small" /> <Text type="secondary" style={{ marginLeft: 8 }}>창고 추천 계산 중…</Text>
          </div>
        ) : candidates.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message="추천 가능한 창고가 없습니다."
            description="활성 NORMAL 창고가 없거나 마스터 데이터가 비어있는 상태입니다."
          />
        ) : (
          <WarehouseCandidateList
            candidates={candidates}
            recommendedId={recommendedId}
            selectedId={selectedWarehouseId}
            onSelect={onWarehouseChange}
          />
        )}
      </div>
    </Card>
  );
}

// ============================================================
// 창고 후보 리스트 — 클릭으로 선택
// ============================================================
function WarehouseCandidateList({
  candidates, recommendedId, selectedId, onSelect,
}: {
  candidates: WarehouseCandidate[];
  recommendedId: string | null;
  selectedId: string | undefined;
  onSelect: (whId: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {candidates.map((c) => {
        const isSelected = c.warehouse_id === selectedId;
        const isRecommended = c.warehouse_id === recommendedId;
        // 가용 슬롯 비율 — 50% 미만이면 노랑, 20% 미만이면 빨강
        const ratio = c.total_locations > 0 ? c.empty_locations / c.total_locations : 0;
        const capacityColor = c.total_locations === 0
          ? '#94a3b8'
          : ratio < 0.2 ? '#ef4444'
          : ratio < 0.5 ? '#f59e0b'
          : '#22c55e';
        return (
          <div
            key={c.warehouse_id}
            onClick={() => onSelect(c.warehouse_id)}
            style={{
              cursor: 'pointer',
              padding: '10px 12px',
              border: `1px solid ${isSelected ? '#1677ff' : '#e5e7eb'}`,
              borderRadius: 6,
              background: isSelected ? '#e6f4ff' : '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              transition: 'background 0.1s, border 0.1s',
            }}
          >
            <div
              style={{
                width: 18, height: 18, borderRadius: '50%',
                border: `2px solid ${isSelected ? '#1677ff' : '#cbd5e1'}`,
                background: isSelected ? '#1677ff' : '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isSelected && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Space size={6} align="center">
                <Text strong style={{ fontSize: 13, color: '#0f172a' }}>{c.warehouse_name}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>{c.warehouse_code}</Text>
                {isRecommended && (
                  <Tooltip title="협력사·카테고리 매칭 점수 1위">
                    <Tag color="green" style={{ margin: 0 }}>
                      <ThunderboltOutlined /> 추천
                    </Tag>
                  </Tooltip>
                )}
              </Space>
              <div style={{ marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>{c.reason}</Text>
              </div>
            </div>
            <Tooltip title="비어있는 location / 전체 활성 location. 점수에는 미반영, 참고용.">
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <Text style={{ fontSize: 11, color: '#94a3b8' }}>빈 슬롯</Text>
                <div style={{ fontSize: 14, fontWeight: 600, color: capacityColor, lineHeight: 1.2 }}>
                  {c.empty_locations.toLocaleString()}
                  <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}> / {c.total_locations.toLocaleString()}</Text>
                </div>
              </div>
            </Tooltip>
            <div style={{ textAlign: 'right', minWidth: 60 }}>
              <Text style={{ fontSize: 11, color: '#94a3b8' }}>점수</Text>
              <div style={{ fontSize: 16, fontWeight: 700, color: isRecommended ? '#22c55e' : '#475569' }}>
                {c.fit_score}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
