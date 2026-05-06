import { useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Typography, Table, Card, Descriptions, Button, Space, InputNumber, App, Result, Spin,
  Row, Col, Tag, Popover,
} from 'antd';
import {
  ArrowLeftOutlined, PrinterOutlined, CheckOutlined, QrcodeOutlined,
  InboxOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useReactToPrint } from 'react-to-print';
import type { ColumnsType } from 'antd/es/table';
import type { PickingItem, PickingStatus } from '@/types/order';
import { PICKING_STATUS_CONFIG } from '@/types/order';
import { usePickingList, usePickingItems, useCompletePicking } from '@/hooks/useOrderQuery';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import { ensureLocationCode } from '@/utils/locationCode';
import OrderQrBadge from '@/components/OrderQrBadge';
import PrintDocument from '@/components/PrintDocument';
import PermissionButton from '@/components/PermissionButton';
import { useUserNameMap, resolveUserName } from '@/hooks/useUserNameMap';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';

const { Title } = Typography;

// ISO datetime (2026-04-22T00:43:07.195778) → '2026-04-22 00:43'
function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '-';
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : v;
}

const statIcon = (color: string) => ({
  width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 16, color, background: `${color}14`, border: `1px solid ${color}22`,
});
const tableHeaderTitle = (label: string) => (
  <span style={{ color: '#334155', fontWeight: 600, fontSize: 12, letterSpacing: '0.01em' }}>{label}</span>
);
const tableHeaderCellStyle: React.CSSProperties = {
  background: '#f8fafc',
  color: '#334155',
  borderBottom: '2px solid #dbe3ee',
  borderRight: 'none',
};

export default function PickingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pickingId = id ?? '';
  const navigate = useNavigate();
  const location = useLocation();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId && pickingId ? `/topic/admin/picking/${clientId}/${pickingId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['picking-list', pickingId] });
      queryClient.invalidateQueries({ queryKey: ['picking-items', pickingId] });
      queryClient.invalidateQueries({ queryKey: ['picking-lists'] });
      showStompToast(message, event);
    },
  );

  const { data: picking, isLoading } = usePickingList(pickingId);
  const { data: items = [], isLoading: itemsLoading } = usePickingItems(pickingId);
  const { data: warehouses = [] } = useWarehouses();
  const completeMutation = useCompletePicking();
  const userMap = useUserNameMap();
  const resolveUser = (id: string | null | undefined) => resolveUserName(userMap, id);

  const [localItems, setLocalItems] = useState<PickingItem[]>([]);
  const displayItems = localItems.length > 0 ? localItems : items;

  const sortedItems = useMemo(
    () => [...displayItems].sort((a, b) => {
      const za = a.zone_code ?? '';
      const zb = b.zone_code ?? '';
      if (za !== zb) return za.localeCompare(zb);
      const ra = (a.rack_code ?? '').localeCompare(b.rack_code ?? '');
      if (ra !== 0) return ra;
      const rowDiff = (a.row_no ?? 0) - (b.row_no ?? 0);
      if (rowDiff !== 0) return rowDiff;
      return (a.level_no ?? 0) - (b.level_no ?? 0);
    }),
    [displayItems],
  );

  const stats = useMemo(() => {
    const total = displayItems.length;
    let done = 0;
    let picking = 0;
    displayItems.forEach((i) => {
      if (i.picked_qty >= i.target_qty) done += 1;
      else if (i.picked_qty > 0) picking += 1;
    });
    const pending = total - done - picking;
    return { total, done, picking, pending };
  }, [displayItems]);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: () => `피킹리스트_${picking?.picking_no ?? pickingId}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 14mm 12mm 18mm 12mm; }
      @media print {
        body { margin: 0 !important; padding: 0 !important; color: #000 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
    onBeforePrint: () => new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); }),
    onPrintError: (_loc, err) => { message.error(err?.message || '인쇄를 시작할 수 없습니다.'); },
  });

  if (isLoading || itemsLoading) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  if (!picking) return <Result status="404" title="피킹 리스트를 찾을 수 없습니다" extra={<Button onClick={() => navigate('/order/picking')}>목록으로</Button>} />;

  const status = picking.status;
  const isEditable = status === 'pending' || status === 'in_progress' || status === 'partial';
  const tableScrollY = sortedItems.length > 6 ? 360 : undefined;
  const returnOutboundIdFromState = (location.state as { returnOutboundId?: string } | null)?.returnOutboundId;
  const linkedOutboundOrderId = returnOutboundIdFromState ?? picking.outbound_order_ids?.[0];
  const goBack = () => {
    if (linkedOutboundOrderId) {
      navigate(`/order/outbound/${linkedOutboundOrderId}`);
      return;
    }
    navigate('/order/picking');
  };

  const handlePickedQtyChange = (itemId: string, value: number | null) => {
    const target = (localItems.length > 0 ? localItems : items).find((i) => i.id === itemId)?.target_qty ?? 0;
    if ((value ?? 0) > target) {
      message.warning(`지시 수량(${target})을 초과할 수 없습니다.`);
      return;
    }
    const base = localItems.length > 0 ? localItems : items;
    setLocalItems(base.map((i) => (i.id === itemId ? { ...i, picked_qty: value ?? 0 } : i)));
  };

  const handleComplete = () => {
    const allDone = displayItems.every((i) => i.picked_qty >= i.target_qty);
    modal.confirm({
      title: allDone ? '피킹 완료 처리하시겠습니까?' : '일부 미완료 품목이 있습니다. 부분완료 처리하시겠습니까?',
      onOk: () => {
        completeMutation.mutate(
          { id: pickingId, items: displayItems.map((i) => ({ id: i.id, picked_qty: i.picked_qty })) },
          {
            onSuccess: () => {
              message.success(allDone ? '피킹 완료' : '부분완료 처리');
              setLocalItems([]);
            },
          },
        );
      },
    });
  };

  const columns: ColumnsType<PickingItem> = [
    {
      title: tableHeaderTitle('위치'), key: 'location', width: 160,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, record) => {
        const locationCode = ensureLocationCode(record.location_code, {
          zone: record.zone_code ?? 'A',
          rack: record.rack_code,
          rowNo: record.row_no,
          levelNo: record.level_no,
        });
        const whId = warehouses.find((w) => w.name === picking.warehouse_name)?.id;
        return (
          <Tag
            color="blue"
            onClick={() => {
              if (!whId) return;
              const params = new URLSearchParams({ wh: whId, tab: 'rack-inventory' });
              if (record.location_id) params.set('locationId', record.location_id);
              if (record.location_code) params.set('locationCode', record.location_code);
              if (record.rack_code && record.rack_code !== '-') params.set('rackCode', record.rack_code);
              navigate(`/warehouse/monitoring?${params.toString()}`);
            }}
            style={{ cursor: whId ? 'pointer' : 'default', fontWeight: 700, margin: 0 }}
          >
            {locationCode}
          </Tag>
        );
      },
    },
    {
      title: tableHeaderTitle('상품'), key: 'product', width: 260,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => (
        <div style={{ lineHeight: 1.5 }}>
          <div style={{ fontWeight: 500, fontSize: 13, color: '#0f172a' }}>{r.product_name}</div>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.sku}</span>
        </div>
      ),
    },
    {
      title: tableHeaderTitle('지시 수량'), dataIndex: 'target_qty', key: 'target_qty', width: 90, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: number) => <span style={{ fontWeight: 500, color: '#334155' }}>{v.toLocaleString()}</span>,
    },
    {
      title: tableHeaderTitle('피킹 수량'), key: 'picked_qty', width: 150, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, record) => (
        isEditable ? (
          <InputNumber
            min={0}
            max={record.target_qty}
            value={record.picked_qty}
            onChange={(val) => handlePickedQtyChange(record.id, val)}
            onPressEnter={(e) => (e.currentTarget as HTMLInputElement).blur()}
            style={{ width: 110 }}
            size="small"
          />
        ) : (
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1677ff' }}>{record.picked_qty.toLocaleString()}</span>
        )
      ),
    },
    {
      title: tableHeaderTitle('상태'), dataIndex: 'status', key: 'status', width: 90, align: 'center',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: PickingStatus) => {
        const cfg = PICKING_STATUS_CONFIG[v];
        return <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.label}</Tag>;
      },
    },
  ];

  return (
    <>
      <div className="no-print" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
        {/* ── 헤더 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18, gap: 10 }}>
          <Space size={8} align="center">
            <Button icon={<ArrowLeftOutlined />} onClick={goBack}>목록</Button>
            <Title level={4} style={{ margin: 0, color: '#0f172a' }}>피킹 리스트 — {picking.picking_no}</Title>
            <Tag color={PICKING_STATUS_CONFIG[status]?.color}>{PICKING_STATUS_CONFIG[status]?.label}</Tag>
            <Popover content={<OrderQrBadge value={`picking:${picking.id}`} label={picking.picking_no} title="피킹 리스트" size={160} />} trigger="click" placement="bottomLeft">
              <Button type="text" size="small" icon={<QrcodeOutlined />} style={{ color: '#64748b', fontSize: 18 }} />
            </Popover>
          </Space>
          <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
            <Button
              icon={<PrinterOutlined />}
              onClick={() => { if (!printRef.current) { message.warning('잠시 후 다시 시도해 주세요.'); return; } void handlePrint(); }}
            >
              출력
            </Button>
            {isEditable && (
              <PermissionButton resource="OUTBOUND" action="UPDATE" type="primary" icon={<CheckOutlined />} onClick={handleComplete} loading={completeMutation.isPending}>
                완료 처리
              </PermissionButton>
            )}
          </div>
        </div>

        {/* ── 정보 ── */}
        <Card size="small" style={{ marginBottom: 20, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Descriptions column={4} size="small">
            <Descriptions.Item label="창고">{picking.warehouse_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="담당자">{picking.assigned_to ? resolveUser(picking.assigned_to) : (picking.assignee || '-')}</Descriptions.Item>
            <Descriptions.Item label="출고지시서">{picking.outbound_count}건</Descriptions.Item>
            <Descriptions.Item label="생성일시">{fmtDateTime(picking.created_at)}</Descriptions.Item>
            <Descriptions.Item label="시작일시">{fmtDateTime(picking.started_at)}</Descriptions.Item>
            <Descriptions.Item label="완료일시" span={3}>{fmtDateTime(picking.completed_at)}</Descriptions.Item>
          </Descriptions>
        </Card>

        {/* ── 요약 카드 4개 ── */}
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { title: '총 품목', value: stats.total, color: '#334155', icon: <InboxOutlined /> },
            { title: '피킹 완료', value: stats.done, color: '#52c41a', icon: <CheckCircleOutlined /> },
            { title: '피킹 중', value: stats.picking, color: '#1677ff', icon: <ClockCircleOutlined /> },
            { title: '대기', value: stats.pending, color: stats.pending > 0 ? '#f59e0b' : '#cbd5e1', icon: <WarningOutlined /> },
          ].map((c) => (
            <Col span={6} key={c.title}>
              <Card size="small" style={{ border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={statIcon(c.color)}>{c.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.title}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{c.value}</div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* ── 품목 테이블 ── */}
        <div style={{ marginTop: 56, paddingBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>상품 내역</span>
            <div style={{ height: 1, background: '#e2e8f0', flex: 1 }} />
          </div>
          <Table
            columns={columns}
            dataSource={sortedItems}
            rowKey="id"
            size="middle"
            pagination={false}
            scroll={tableScrollY ? { y: tableScrollY } : undefined}
            rowClassName={(r) => (r.picked_qty >= r.target_qty ? 'picking-done' : '')}
            onRow={() => ({ style: { height: 56 } })}
          />
        </div>

        {sortedItems.length === 0 && (
          <Result icon={<InboxOutlined style={{ color: '#cbd5e1' }} />} title="피킹 품목이 없습니다" />
        )}
      </div>

      {/* ── 인쇄용 ── */}
      <div className="print-only">
        <PrintDocument
          ref={printRef}
          title="피킹 리스트"
          subtitle={`${picking.warehouse_name} · ${resolveUser(picking.assignee)}`}
          orderNo={picking.picking_no}
          qrValue={`picking:${picking.id}`}
          documentOperator={resolveUser(picking.assignee)}
          info={[
            { label: '피킹번호', value: picking.picking_no },
            { label: '창고', value: picking.warehouse_name },
            { label: '담당자', value: resolveUser(picking.assignee) },
            { label: '상태', value: PICKING_STATUS_CONFIG[status]?.label ?? status },
            { label: '출고지시서', value: `${picking.outbound_count}건` },
            { label: '생성일시', value: fmtDateTime(picking.created_at) },
            { label: '시작일시', value: fmtDateTime(picking.started_at) },
            { label: '완료일시', value: fmtDateTime(picking.completed_at) },
          ]}
          columns={[
            { label: '위치', key: 'location', width: 90 },
            { label: '상품명', key: 'product_name' },
            { label: 'SKU', key: 'sku', width: 110 },
            { label: '지시수량', key: 'target_qty', numeric: true, width: 72, bold: true },
            { label: '피킹수량', key: 'picked_qty', numeric: true, width: 72 },
            { label: '확인', key: 'chk', align: 'center', width: 40 },
          ]}
          data={sortedItems.map((p) => ({
            location: ensureLocationCode(p.location_code, {
              zone: p.zone_code ?? 'A', rack: p.rack_code, rowNo: p.row_no, levelNo: p.level_no,
            }),
            product_name: p.product_name,
            sku: p.sku,
            target_qty: p.target_qty.toLocaleString(),
            picked_qty: p.picked_qty.toLocaleString(),
            chk: '☐',
          }))}
          footer={{
            left: `총 ${stats.total}개 품목 · ${sortedItems.reduce((s, p) => s + p.target_qty, 0)}개`,
            right: `완료 ${stats.done} / 진행중 ${stats.picking} / 대기 ${stats.pending}`,
          }}
        />
      </div>

      <style>{`
        .picking-done td { background: #f0fdf4 !important; }
        .ant-table-thead > tr > th { background: #f8fafc !important; color: #475569 !important; font-weight: 600 !important; font-size: 12px !important; }
        .print-only { display: none; }
        @media print { .no-print { display: none !important; } .print-only { display: block !important; } }
      `}</style>
    </>
  );
}
