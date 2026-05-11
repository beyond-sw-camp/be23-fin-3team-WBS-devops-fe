import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button, Card, Empty, Progress, Segmented, Space, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  ApartmentOutlined, InboxOutlined, ReloadOutlined, SwapOutlined, TeamOutlined, UserSwitchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getUsers } from '@/api/settings';
import { getInboundOrders, getAllPlacements } from '@/api/inbound';
import { getOutboundOrders, getEtcInOutOrders, getPickingLists, getTransferOrders } from '@/api/order';
import { getStockCountOrders } from '@/api/inventory';
import type {
  EtcInOutOrder, InboundOrder, OutboundOrder, PickingList, PlacementItem, TransferOrder,
} from '@/types/order';
import type { StockCountOrder } from '@/types/inventory';
import type { UserListItem } from '@/types/user';
import { ORDER_STATUS_CONFIG, PICKING_STATUS_CONFIG } from '@/types/order';

const { Title, Text } = Typography;

type WorkType = 'inspection' | 'placement' | 'picking' | 'dispatch' | 'transfer' | 'etc' | 'stock-count';
type ViewKey = 'all' | WorkType | 'workers';

interface WorkRow {
  key: string;
  type: WorkType;
  typeLabel: string;
  workNo: string;
  warehouseName: string;
  assigneeId: string | null;
  assigneeName: string;
  status: string;
  qty: number;
  createdAt: string | null;
  trigger: string;
  targetPath: string;
}

interface WorkerLoadRow {
  id: string;
  name: string;
  loginId: string;
  role: string;
  activeCount: number;
  counts: Record<WorkType, number>;
}

const TYPE_META: Record<WorkType, { label: string; color: string }> = {
  inspection: { label: '검수 작업', color: 'geekblue' },
  placement: { label: '적치 작업', color: 'cyan' },
  picking: { label: '피킹 작업', color: 'blue' },
  dispatch: { label: '출고 작업', color: 'purple' },
  transfer: { label: '이동 작업', color: 'magenta' },
  etc: { label: '기타 입출고', color: 'orange' },
  'stock-count': { label: '재고 실사', color: 'green' },
};

function fmtDate(v: string | null | undefined): string {
  if (!v) return '-';
  const m = v.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!m) return v;
  return m[2] ? `${m[1]} ${m[2]}` : m[1];
}

function isAssignable(user: UserListItem): boolean {
  const role = (user.roleCode ?? '').toUpperCase();
  return role.includes('OPERATOR') || role.includes('MANAGER');
}

function resolveAssignee(id: string | null | undefined, explicitName: string | null | undefined, nameById: Map<string, string>): string {
  if (explicitName) return explicitName;
  if (id && nameById.has(id)) return nameById.get(id)!;
  return id ? '이름 미확인' : '미지정';
}

function statusTag(status: string) {
  if (status in PICKING_STATUS_CONFIG) {
    const cfg = PICKING_STATUS_CONFIG[status as keyof typeof PICKING_STATUS_CONFIG];
    return <Tag color={cfg.color}>{cfg.label}</Tag>;
  }
  if (status in ORDER_STATUS_CONFIG) {
    const cfg = ORDER_STATUS_CONFIG[status as keyof typeof ORDER_STATUS_CONFIG];
    return <Tag color={cfg.color}>{cfg.label}</Tag>;
  }
  const label: Record<string, string> = {
    pending: '대기',
    in_progress: '진행중',
    approved: '승인',
    draft: '초안',
    completed: '완료',
    partial: '부분완료',
    cancelled: '취소',
  };
  const color: Record<string, string> = {
    pending: 'default',
    in_progress: 'processing',
    approved: 'processing',
    draft: 'default',
    completed: 'success',
    partial: 'warning',
    cancelled: 'error',
  };
  return <Tag color={color[status] ?? 'default'}>{label[status] ?? status}</Tag>;
}

function buildInspectionRows(rows: InboundOrder[], nameById: Map<string, string>): WorkRow[] {
  return rows
    .filter((o) => o.status === 'approved')
    .map((o) => ({
      key: `inspection-${o.id}`,
      type: 'inspection',
      typeLabel: TYPE_META.inspection.label,
      workNo: o.order_no,
      warehouseName: o.warehouse_name,
      assigneeId: o.assigned_to ?? null,
      assigneeName: resolveAssignee(o.assigned_to, o.assigned_to_name, nameById),
      status: o.status,
      qty: o.total_qty ?? 0,
      createdAt: o.approved_at ?? o.created_at,
      trigger: '입고지시서 승인 시 자동배정',
      targetPath: `/order/inbound/${o.id}`,
    }));
}

function buildPlacementRows(items: PlacementItem[], nameById: Map<string, string>): WorkRow[] {
  const grouped = new Map<string, PlacementItem[]>();
  items
    .filter((it) => !it.is_placed)
    .forEach((it) => {
      const key = it.placement_order_id;
      grouped.set(key, [...(grouped.get(key) ?? []), it]);
    });

  return Array.from(grouped.entries()).map(([placementOrderId, group]) => {
    const head = group[0];
    const assignedTo = head?.assigned_to ?? null;
    return {
      key: `placement-${placementOrderId}`,
      type: 'placement',
      typeLabel: TYPE_META.placement.label,
      workNo: head?.placement_no ?? '-',
      warehouseName: head?.warehouse_id ? head.warehouse_id.slice(0, 8) : '-',
      assigneeId: assignedTo,
      assigneeName: resolveAssignee(assignedTo, null, nameById),
      status: group.some((it) => it.is_placed) ? 'in_progress' : 'pending',
      qty: group.reduce((sum, it) => sum + (it.qty ?? 0), 0),
      createdAt: null,
      trigger: '입고 검수 완료 후 적치지시서 생성 시 자동배정',
      targetPath: head?.inbound_order_id ? `/order/inbound/${head.inbound_order_id}/placement` : '/order/inbound/placements',
    };
  });
}

function buildPickingRows(rows: PickingList[], nameById: Map<string, string>): WorkRow[] {
  return rows
    .filter((p) => p.status === 'pending' || p.status === 'in_progress')
    .map((p) => ({
      key: `picking-${p.id}`,
      type: 'picking',
      typeLabel: TYPE_META.picking.label,
      workNo: p.picking_no,
      warehouseName: p.warehouse_name,
      assigneeId: p.assigned_to ?? null,
      assigneeName: resolveAssignee(p.assigned_to, p.assignee !== '-' ? p.assignee : null, nameById),
      status: p.status,
      qty: p.outbound_count,
      createdAt: p.created_at ?? null,
      trigger: '웨이브/피킹리스트 생성 시 자동배정',
      targetPath: `/order/picking/${p.id}`,
    }));
}

function buildDispatchRows(rows: OutboundOrder[], nameById: Map<string, string>): WorkRow[] {
  return rows
    .filter((o) => o.status === 'approved' || o.status === 'in_progress' || o.status === 'partial')
    .map((o) => ({
      key: `dispatch-${o.id}`,
      type: 'dispatch',
      typeLabel: TYPE_META.dispatch.label,
      workNo: o.order_no,
      warehouseName: o.warehouse_name,
      assigneeId: o.assigned_to ?? null,
      assigneeName: resolveAssignee(o.assigned_to, o.assigned_to_name, nameById),
      status: o.status,
      qty: o.total_qty ?? 0,
      createdAt: o.approved_at ?? o.created_at,
      trigger: '출고지시서 승인 시 자동배정',
      targetPath: `/order/outbound/${o.id}`,
    }));
}

function buildTransferRows(rows: TransferOrder[], nameById: Map<string, string>): WorkRow[] {
  return rows
    .filter((o) => o.status === 'approved' || o.status === 'in_progress' || o.status === 'partial')
    .map((o) => ({
      key: `transfer-${o.id}`,
      type: 'transfer',
      typeLabel: TYPE_META.transfer.label,
      workNo: o.order_no,
      warehouseName: `${o.from_warehouse_name} -> ${o.to_warehouse_name}`,
      assigneeId: o.assigned_to ?? null,
      assigneeName: resolveAssignee(o.assigned_to, o.assigned_to_name, nameById),
      status: o.status,
      qty: o.total_qty,
      createdAt: o.approved_at ?? o.created_at,
      trigger: '이동지시서 승인 시 자동배정',
      targetPath: `/order/transfer/${o.id}`,
    }));
}

function buildEtcRows(rows: EtcInOutOrder[], nameById: Map<string, string>): WorkRow[] {
  return rows
    .filter((o) => o.status === 'approved')
    .map((o) => ({
      key: `etc-${o.id}`,
      type: 'etc',
      typeLabel: TYPE_META.etc.label,
      workNo: o.order_no,
      warehouseName: o.warehouse_name,
      assigneeId: o.assigned_to ?? null,
      assigneeName: resolveAssignee(o.assigned_to, o.assigned_to_name, nameById),
      status: o.status,
      qty: 0,
      createdAt: o.approved_at ?? o.created_at,
      trigger: '기타입출고 승인 시 자동배정',
      targetPath: `/etc-inout/${o.direction}/${o.id}`,
    }));
}

function buildStockCountRows(rows: StockCountOrder[], nameById: Map<string, string>): WorkRow[] {
  return rows
    .filter((o) => o.status === 'in_progress')
    .map((o) => ({
      key: `stock-count-${o.id}`,
      type: 'stock-count',
      typeLabel: TYPE_META['stock-count'].label,
      workNo: o.order_no,
      warehouseName: o.warehouse_name || o.warehouse_id.slice(0, 8),
      assigneeId: o.assigned_to ?? null,
      assigneeName: resolveAssignee(o.assigned_to, o.assigned_to_name, nameById),
      status: o.status,
      qty: 0,
      createdAt: o.created_at,
      trigger: '재고실사 시작 시 자동배정',
      targetPath: `/inventory/stock-count/${o.id}`,
    }));
}

export default function AutoAssignmentPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewKey>('all');

  const usersQuery = useQuery({ queryKey: ['users-for-auto-assignment'], queryFn: getUsers });
  const inboundQuery = useQuery({ queryKey: ['auto-assignment', 'inbound-orders'], queryFn: () => getInboundOrders() });
  const placementQuery = useQuery({ queryKey: ['auto-assignment', 'placements'], queryFn: () => getAllPlacements() });
  const pickingQuery = useQuery({ queryKey: ['auto-assignment', 'picking-lists'], queryFn: getPickingLists, refetchInterval: 5000 });
  const outboundQuery = useQuery({ queryKey: ['auto-assignment', 'outbound-orders'], queryFn: () => getOutboundOrders() });
  const transferQuery = useQuery({ queryKey: ['auto-assignment', 'transfer-orders'], queryFn: getTransferOrders });
  const etcQuery = useQuery({ queryKey: ['auto-assignment', 'etc-inout-orders'], queryFn: getEtcInOutOrders });
  const stockCountQuery = useQuery({ queryKey: ['auto-assignment', 'stock-count-orders'], queryFn: getStockCountOrders });

  const users = usersQuery.data ?? [];
  const assignableUsers = useMemo(() => users.filter(isAssignable), [users]);
  const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  const workRows = useMemo(() => [
    ...buildInspectionRows(inboundQuery.data ?? [], nameById),
    ...buildPlacementRows(placementQuery.data ?? [], nameById),
    ...buildPickingRows(pickingQuery.data ?? [], nameById),
    ...buildDispatchRows(outboundQuery.data ?? [], nameById),
    ...buildTransferRows(transferQuery.data ?? [], nameById),
    ...buildEtcRows(etcQuery.data ?? [], nameById),
    ...buildStockCountRows(stockCountQuery.data ?? [], nameById),
  ], [
    inboundQuery.data,
    placementQuery.data,
    pickingQuery.data,
    outboundQuery.data,
    transferQuery.data,
    etcQuery.data,
    stockCountQuery.data,
    nameById,
  ]);

  const filteredRows = useMemo(
    () => (view === 'all' || view === 'workers' ? workRows : workRows.filter((row) => row.type === view)),
    [view, workRows],
  );

  const workerRows = useMemo<WorkerLoadRow[]>(() => {
    const byUser = new Map<string, WorkerLoadRow>();
    assignableUsers.forEach((u) => {
      byUser.set(u.id, {
        id: u.id,
        name: u.name,
        loginId: u.loginId,
        role: u.roleName ?? u.roleCode ?? '-',
        activeCount: 0,
        counts: {
          inspection: 0,
          placement: 0,
          picking: 0,
          dispatch: 0,
          transfer: 0,
          etc: 0,
          'stock-count': 0,
        },
      });
    });
    workRows.forEach((row) => {
      if (!row.assigneeId) return;
      const worker = byUser.get(row.assigneeId);
      if (!worker) return;
      worker.activeCount += 1;
      worker.counts[row.type] += 1;
    });
    return Array.from(byUser.values()).sort((a, b) => b.activeCount - a.activeCount || a.name.localeCompare(b.name));
  }, [assignableUsers, workRows]);

  const refreshAll = async () => {
    await Promise.all([
      usersQuery.refetch(),
      inboundQuery.refetch(),
      placementQuery.refetch(),
      pickingQuery.refetch(),
      outboundQuery.refetch(),
      transferQuery.refetch(),
      etcQuery.refetch(),
      stockCountQuery.refetch(),
    ]);
  };

  const isLoading = [
    usersQuery, inboundQuery, placementQuery, pickingQuery, outboundQuery, transferQuery, etcQuery, stockCountQuery,
  ].some((q) => q.isLoading);
  const assignedCount = workRows.filter((row) => row.assigneeId).length;
  const activeAssigneeCount = new Set(workRows.map((row) => row.assigneeId).filter(Boolean)).size;

  const workColumns: ColumnsType<WorkRow> = [
    {
      title: '작업 유형', dataIndex: 'typeLabel', key: 'typeLabel', width: 130,
      render: (_: string, row) => <Tag color={TYPE_META[row.type].color}>{row.typeLabel}</Tag>,
    },
    {
      title: '작업번호', dataIndex: 'workNo', key: 'workNo', width: 160,
      render: (v: string, row) => (
        <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => navigate(row.targetPath)}>
          {v}
        </Button>
      ),
    },
    { title: '창고/범위', dataIndex: 'warehouseName', key: 'warehouseName', width: 180, ellipsis: true },
    {
      title: '담당자', dataIndex: 'assigneeName', key: 'assigneeName', width: 140,
      render: (v: string, row) => (
        <Space size={6}>
          <UserSwitchOutlined style={{ color: row.assigneeId ? '#1677ff' : '#94a3b8' }} />
          <Text type={row.assigneeId ? undefined : 'secondary'}>{v}</Text>
        </Space>
      ),
    },
    { title: '상태', dataIndex: 'status', key: 'status', width: 110, align: 'center', render: statusTag },
    {
      title: '수량/건수', dataIndex: 'qty', key: 'qty', width: 100, align: 'right',
      render: (v: number) => (v > 0 ? v.toLocaleString() : '-'),
    },
    { title: '발생일', dataIndex: 'createdAt', key: 'createdAt', width: 130, render: fmtDate },
    { title: '자동배정 시점', dataIndex: 'trigger', key: 'trigger', ellipsis: true },
  ];

  const workerColumns: ColumnsType<WorkerLoadRow> = [
    {
      title: '작업자', key: 'worker', width: 220,
      render: (_, row) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600 }}>{row.name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{row.loginId} · {row.role}</Text>
        </div>
      ),
    },
    {
      title: '활성 작업', dataIndex: 'activeCount', key: 'activeCount', width: 100, align: 'right',
      render: (v: number) => <Text strong>{v.toLocaleString()}</Text>,
    },
    {
      title: '부하', key: 'load', width: 180,
      render: (_, row) => <Progress percent={Math.min(100, row.activeCount * 15)} showInfo={false} strokeColor={row.activeCount >= 5 ? '#faad14' : '#1677ff'} />,
    },
    ...Object.entries(TYPE_META).map(([type, meta]) => ({
      title: meta.label.replace(' 작업', ''),
      key: type,
      width: 80,
      align: 'right' as const,
      render: (_: unknown, row: WorkerLoadRow) => row.counts[type as WorkType],
    })),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Title level={4} style={{ margin: 0 }}>작업자 자동배정 모니터링</Title>
        <Tooltip title="목록 새로고침">
          <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={isLoading}>새로고침</Button>
        </Tooltip>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
        <Card size="small">
          <Statistic title="배정 가능 작업자" value={assignableUsers.length} prefix={<TeamOutlined />} />
        </Card>
        <Card size="small">
          <Statistic title="활성 작업" value={workRows.length} prefix={<ApartmentOutlined />} />
        </Card>
        <Card size="small">
          <Statistic title="배정 완료" value={assignedCount} prefix={<UserSwitchOutlined />} />
        </Card>
        <Card size="small">
          <Statistic title="작업 중 인원" value={activeAssigneeCount} prefix={<SwapOutlined />} />
        </Card>
      </div>

      <Card size="small" styles={{ body: { padding: 16 } }}>
        <Segmented
          value={view}
          onChange={(v) => setView(v as ViewKey)}
          options={[
            { value: 'all', label: `전체 ${workRows.length}` },
            ...Object.entries(TYPE_META).map(([type, meta]) => ({
              value: type,
              label: `${meta.label.replace(' 작업', '')} ${workRows.filter((row) => row.type === type).length}`,
            })),
            { value: 'workers', label: `작업자 부하 ${workerRows.length}` },
          ]}
          style={{ marginBottom: 12 }}
        />

        {view === 'workers' ? (
          <Table
            size="small"
            columns={workerColumns}
            dataSource={workerRows}
            rowKey="id"
            loading={isLoading}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="배정 가능 작업자가 없습니다" /> }}
            pagination={false}
            scroll={{ x: 980 }}
          />
        ) : (
          <Table
            size="small"
            columns={workColumns}
            dataSource={filteredRows}
            rowKey="key"
            loading={isLoading}
            locale={{ emptyText: <Empty image={<InboxOutlined style={{ fontSize: 32, color: '#cbd5e1' }} />} description="현재 배정된 활성 작업이 없습니다" /> }}
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 1080 }}
          />
        )}
      </Card>
    </div>
  );
}
