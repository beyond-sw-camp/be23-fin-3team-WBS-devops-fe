import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Table,
  Button,
  Input,
  Tag,
  Modal,
  Form,
  Select,
  App,
  Card,
  Segmented,
  Progress,
} from 'antd';
import { WAREHOUSE_TYPE_LABEL } from '@/utils/labels';
import {
  PlusOutlined,
  SearchOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Warehouse } from '@/types/warehouse';
import { useWarehouses, useCreateWarehouse } from '@/hooks/useWarehouseQuery';
import './warehouseListPage.css';

const { Text } = Typography;

type StatusFilter = 'all' | 'active' | 'inactive';
type ViewMode = 'grid' | 'list';

function formatListDate(iso?: string): string {
  if (!iso) return '—';
  return iso.replace(/-/g, '.');
}

export default function WarehouseListPage() {
  const navigate = useNavigate();
  const { data: warehouses = [], isLoading } = useWarehouses();
  const createWarehouse = useCreateWarehouse();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  const filtered = useMemo(() => {
    let list = warehouses;
    if (statusFilter === 'active') list = list.filter((w) => w.is_active);
    else if (statusFilter === 'inactive') list = list.filter((w) => !w.is_active);
    if (!search.trim()) return list;
    const kw = search.trim().toLowerCase();
    return list.filter(
      (w) =>
        w.name.toLowerCase().includes(kw) ||
        w.code.toLowerCase().includes(kw) ||
        w.address.toLowerCase().includes(kw),
    );
  }, [warehouses, search, statusFilter]);

  const handleCreate = () => {
    form.validateFields().then((values) => {
      createWarehouse.mutate(values, {
        onSuccess: (wh) => {
          message.success(`${wh.name} 창고가 생성되었습니다.`);
          setModalOpen(false);
          navigate(`/warehouse/layout-editor?wh=${wh.id}&tab=zone`);
        },
      });
    });
  };

  const columns: ColumnsType<Warehouse> = [
    {
      title: '창고코드',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code: string) => <Text strong style={{ fontSize: 15 }}>{code}</Text>,
    },
    {
      title: '창고명',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string) => <Text strong style={{ fontSize: 16 }}>{name}</Text>,
    },
    {
      title: '주소',
      dataIndex: 'address',
      key: 'address',
      ellipsis: true,
      render: (a: string) => <span style={{ fontSize: 15 }}>{a}</span>,
    },
    {
      title: '구역',
      dataIndex: 'zone_count',
      key: 'zone_count',
      width: 88,
      align: 'center',
      render: (n: number) => <Text strong style={{ fontSize: 16 }}>{n}</Text>,
    },
    {
      title: '랙',
      dataIndex: 'rack_count',
      key: 'rack_count',
      width: 88,
      align: 'center',
      render: (n: number) => <Text strong style={{ fontSize: 16 }}>{n}</Text>,
    },
    {
      title: '랙 사용률',
      dataIndex: 'rack_utilization_percent',
      key: 'util',
      width: 160,
      render: (v: number | undefined) =>
        v == null ? (
          <Text type="secondary">—</Text>
        ) : (
          <Progress percent={Math.min(100, Math.max(0, v))} size="small" status={v > 90 ? 'exception' : 'normal'} />
        ),
    },
    {
      title: '최근 수정',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 120,
      render: (d: string | undefined) => <span style={{ fontSize: 15 }}>{formatListDate(d)}</span>,
    },
    {
      title: '상태',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      align: 'center',
      render: (v: boolean) =>
        v ? <Tag color="green" style={{ fontSize: 13, padding: '2px 10px' }}>활성</Tag> : <Tag style={{ fontSize: 13, padding: '2px 10px' }}>비활성</Tag>,
    },
  ];

  const goDetail = (id: string) => navigate(`/warehouse/${id}`);

  return (
    <div className="warehouse-list-page">
      <div className="warehouse-page-shell">
        <div className="warehouse-list-page__toolbar">
          <div className="warehouse-list-page__title-block">
            <h2>창고 목록</h2>
            <p className="warehouse-list-page__subtitle">
              구역·랙·사용률을 한눈에 보고 바로 관리 화면으로 이동하세요.
            </p>
          </div>
          <div className="warehouse-list-page__search-row">
            <Input
              placeholder="창고명, 코드, 주소로 검색"
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 280 }}
            />
            <Segmented
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[
                { label: '전체', value: 'all' },
                { label: '사용중', value: 'active' },
                { label: '미사용', value: 'inactive' },
              ]}
            />
            <Segmented
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              options={[
                { label: <span><AppstoreOutlined /> 카드</span>, value: 'grid' },
                { label: <span><UnorderedListOutlined /> 목록</span>, value: 'list' },
              ]}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
              창고 추가
            </Button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          filtered.length === 0 && !isLoading ? (
            <div className="warehouse-list-page__empty">조건에 맞는 창고가 없습니다.</div>
          ) : (
            <div className="warehouse-list-page__grid">
              {filtered.map((w) => (
                <Card key={w.id} className="warehouse-list-card" onClick={() => goDetail(w.id)}>
                  <div>
                    <h3 className="warehouse-list-card__name">{w.name}</h3>
                    <div className="warehouse-list-card__meta">
                      <Tag>{w.code}</Tag>
                      {w.is_active ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag>}
                    </div>
                    <div className="warehouse-list-card__stats">
                      <div>
                        <div className="warehouse-list-card__stat-label">구역 수</div>
                        <div className="warehouse-list-card__stat-value">{w.zone_count}</div>
                      </div>
                      <div>
                        <div className="warehouse-list-card__stat-label">랙 수</div>
                        <div className="warehouse-list-card__stat-value">{w.rack_count}</div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div className="warehouse-list-card__stat-label">랙 사용률</div>
                        {w.rack_utilization_percent == null ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
                        ) : (
                          <Progress
                            className="warehouse-list-card__util"
                            percent={Math.min(100, Math.max(0, w.rack_utilization_percent))}
                            size="small"
                            strokeColor={w.rack_utilization_percent > 85 ? '#f59e0b' : '#4A6CF7'}
                          />
                        )}
                      </div>
                    </div>
                    <div className="warehouse-list-card__address">
                      <EnvironmentOutlined style={{ marginRight: 4, color: '#94a3b8', fontSize: 11 }} />
                      {w.address}
                    </div>
                    <Button type="primary" block size="small" style={{ marginTop: 'auto' }} onClick={(e) => { e.stopPropagation(); goDetail(w.id); }}>
                      상세 · 관리
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          <div className="warehouse-list-page__table-wrap">
            <Table
              className="warehouse-list-page__table"
              columns={columns}
              dataSource={filtered}
              rowKey="id"
              loading={isLoading}
              pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `총 ${t}건` }}
              bordered
              size="middle"
              locale={{ emptyText: '조건에 맞는 창고가 없습니다.' }}
              onRow={(r) => ({
                onClick: () => goDetail(r.id),
                style: { cursor: 'pointer' },
              })}
            />
          </div>
        )}
      </div>

      <Modal
        title="창고 추가"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={createWarehouse.isPending}
        okText="생성"
        cancelText="취소"
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ warehouse_type: 'NORMAL', region_code: 'SEL' }}>
          <Form.Item name="name" label="창고명" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="주소" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="region_code" label="지역" rules={[{ required: true }]}
            tooltip="창고 코드 자동생성에 사용됩니다 (예: WH-SEL-NOR-001)">
            <Select
              options={[
                { value: 'SEL', label: '서울 (SEL)' },
                { value: 'PUS', label: '부산 (PUS)' },
                { value: 'DAE', label: '대구 (DAE)' },
                { value: 'ICN', label: '인천 (ICN)' },
                { value: 'GWJ', label: '광주 (GWJ)' },
                { value: 'DJN', label: '대전 (DJN)' },
                { value: 'USN', label: '울산 (USN)' },
              ]}
            />
          </Form.Item>
          <Form.Item name="warehouse_type" label="창고 유형" rules={[{ required: true }]}>
            <Select
              options={Object.entries(WAREHOUSE_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
