import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Typography, Table, Tag, Space, Modal, Tabs, Badge, App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { OutboundOrder, PickingList, PickingStatus, OrderStatus } from '@/types/order';
import { ORDER_STATUS_CONFIG, PICKING_STATUS_CONFIG } from '@/types/order';
import { usePickingLists, useSearchPickingLists, useOutboundOrders } from '@/hooks/useOrderQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';
import WaveCreateModal from '@/components/WaveCreateModal';
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

/** 피킹 리스트 탭 정의 — 백엔드 상태를 업무 단계로 묶음 */
type PickingTabKey = 'all' | 'pending' | 'in_progress' | 'completed' | 'issue';

const TAB_STATUSES: Record<PickingTabKey, PickingStatus[] | null> = {
  all: null,
  pending: ['pending'],
  in_progress: ['in_progress'],
  completed: ['completed'],
  issue: ['partial'],
};

const TAB_LABELS: Record<PickingTabKey, string> = {
  all: '전체',
  pending: '대기',
  in_progress: '진행중',
  completed: '완료',
  issue: '이슈',
};

const TAB_BADGE_COLOR: Record<PickingTabKey, string> = {
  all: '#64748b',
  pending: '#1677ff',
  in_progress: '#f59e0b',
  completed: '#52c41a',
  issue: '#ef4444',
};

export default function PickingListPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PickingTabKey>('all');
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId ? `/topic/admin/picking/${clientId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['picking-lists'] });
      showStompToast(message, event);
    },
  );

  const productFilter = useProductFilterForOrder();
  const { data: rawLists = [], isLoading: rawLoading } = usePickingLists();
  const { data: searchedLists = [], isLoading: searchLoading } = useSearchPickingLists(productFilter.productIds);
  const allLists = productFilter.isFiltering ? searchedLists : rawLists;
  const isLoading = productFilter.isFiltering ? searchLoading : rawLoading;
  const { data: outboundOrders = [] } = useOutboundOrders();
  const [selectOpen, setSelectOpen] = useState(false);
  const [waveOpen, setWaveOpen] = useState(false);
  const [selectedOutboundIds, setSelectedOutboundIds] = useState<string[]>([]);
  const userMap = useUserNameMap();

  // 탭별 건수
  const tabCounts = useMemo(() => {
    const counts: Record<PickingTabKey, number> = {
      all: allLists.length,
      pending: 0,
      in_progress: 0,
      completed: 0,
      issue: 0,
    };
    allLists.forEach((l) => {
      (Object.keys(TAB_STATUSES) as PickingTabKey[]).forEach((key) => {
        const statuses = TAB_STATUSES[key];
        if (key !== 'all' && statuses?.includes(l.status)) counts[key] += 1;
      });
    });
    return counts;
  }, [allLists]);

  // 현재 탭에 해당하는 피킹리스트만 필터
  const lists = useMemo(() => {
    const statuses = TAB_STATUSES[activeTab];
    if (!statuses) return allLists;
    return allLists.filter((l) => statuses.includes(l.status));
  }, [allLists, activeTab]);

  const columns: ColumnsType<PickingList> = [
    { title: '피킹번호', dataIndex: 'picking_no', key: 'picking_no', width: 140 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
    {
      title: '담당자', key: 'assignee', width: 100,
      render: (_, r) => {
        if (r.assignee && r.assignee !== '-') return r.assignee;
        if (r.assigned_to) return resolveUserName(userMap, r.assigned_to);
        return '-';
      },
    },
    { title: '출고지시서 수', dataIndex: 'outbound_count', key: 'outbound_count', width: 120, align: 'center' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 100, align: 'center', render: (v: PickingStatus) => <Tag color={PICKING_STATUS_CONFIG[v].color}>{PICKING_STATUS_CONFIG[v].label}</Tag> },
    { title: '생성일시', dataIndex: 'created_at', key: 'created_at', width: 140, render: fmtDateTime },
    { title: '시작일시', dataIndex: 'started_at', key: 'started_at', width: 140, render: fmtDateTime },
    { title: '완료일시', dataIndex: 'completed_at', key: 'completed_at', width: 140, render: fmtDateTime },
  ];
  const outboundColumns: ColumnsType<OutboundOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 130 },
    { title: '출고처', dataIndex: 'store_name', key: 'store_name', width: 140 },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90, render: (v: OrderStatus) => <Tag color={ORDER_STATUS_CONFIG[v].color}>{ORDER_STATUS_CONFIG[v].label}</Tag> },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 90, align: 'right', render: (v) => v?.toLocaleString() ?? '-' },
  ];
  const approvedOrders = useMemo(() => outboundOrders.filter((o) => o.status === 'approved'), [outboundOrders]);

  const proceedToWave = () => {
    if (selectedOutboundIds.length === 0) return;
    setSelectOpen(false);
    setWaveOpen(true);
  };

  const handleWaveSuccess = (picking: PickingList) => {
    setWaveOpen(false);
    setSelectedOutboundIds([]);
    navigate(`/order/picking/${picking.id}`);
  };

  return (
    <>
      <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Title level={4} style={{ margin: 0 }}>피킹 리스트</Title>
        <Space>
          <ProductFilterTriggerButton
            {...productFilter}
            matchedProductCount={productFilter.productIds?.length ?? null}
          />
          <PermissionButton resource="OUTBOUND" action="CREATE" type="primary" onClick={() => setSelectOpen(true)} disabled={approvedOrders.length === 0}>
            웨이브 피킹 생성
          </PermissionButton>
        </Space>
      </div>

      {productFilter.isFiltering && (
        <div style={{ marginBottom: 12 }}>
          <ProductFilterStatusBar
            {...productFilter}
            matchedProductCount={productFilter.productIds?.length ?? null}
            filteredLineCount={allLists.length}
          />
        </div>
      )}

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as PickingTabKey)}
        items={(Object.keys(TAB_STATUSES) as PickingTabKey[]).map((key) => ({
          key,
          label: (
            <Space size={8}>
              <span>{TAB_LABELS[key]}</span>
              <Badge
                count={tabCounts[key]}
                showZero
                style={{
                  backgroundColor: activeTab === key ? TAB_BADGE_COLOR[key] : '#e2e8f0',
                  color: activeTab === key ? '#fff' : '#64748b',
                }}
                overflowCount={999}
              />
            </Space>
          ),
        }))}
        style={{ marginBottom: 8 }}
      />

      <Table columns={columns} dataSource={lists} rowKey="id" loading={isLoading}
        onRow={(r) => ({ onClick: () => navigate(`/order/picking/${r.id}`), style: { cursor: 'pointer' } })} />

      <Modal
        title="출고지시서 선택"
        open={selectOpen}
        onCancel={() => setSelectOpen(false)}
        onOk={proceedToWave}
        okText="다음 (담당자 배정)"
        cancelText="취소"
        okButtonProps={{ disabled: selectedOutboundIds.length === 0 }}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            승인된 출고지시서 중 웨이브로 묶을 지시서를 선택하세요. 같은 창고의 지시서끼리 묶는 걸 권장합니다.
          </div>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={approvedOrders}
            columns={outboundColumns}
            rowSelection={{
              selectedRowKeys: selectedOutboundIds,
              onChange: (keys) => setSelectedOutboundIds(keys as string[]),
            }}
          />
        </Space>
      </Modal>

      <WaveCreateModal
        open={waveOpen}
        outboundOrderIds={selectedOutboundIds}
        onClose={() => setWaveOpen(false)}
        onSuccess={handleWaveSuccess}
      />
      </div>
      <style>{`
        .order-list-tone .ant-table-thead > tr > th {
          background: #f8fafc !important;
          color: #475569 !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          border-bottom: 2px solid #dbe3ee !important;
        }
      `}</style>
    </>
  );
}
