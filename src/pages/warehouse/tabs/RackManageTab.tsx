import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Space, Tag, Modal, Form, Select, Input, InputNumber, App, Card, Progress, Empty, Popover } from 'antd';
import { EditOutlined, StopOutlined, LayoutOutlined, PlayCircleOutlined, QrcodeOutlined, PrinterOutlined } from '@ant-design/icons';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import type { Rack } from '@/types/warehouse';
import { useZonesByWarehouse, useRacks, useUpdateRack } from '@/hooks/useWarehouseQuery';
import { useSuppliers } from '@/hooks/useMasterQuery';
import { tagColorByKey } from '@/utils/badgeColor';
import OrderQrBadge from '@/components/OrderQrBadge';

export default function RackManageTab({ warehouseId }: { warehouseId: string }) {
  const navigate = useNavigate();
  const { data: zones = [] } = useZonesByWarehouse(warehouseId);
  const { data: suppliers = [] } = useSuppliers();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const rackParams = useMemo(() => selectedZoneId ? { zoneId: selectedZoneId } : { warehouseId }, [selectedZoneId, warehouseId]);
  const { data: racks = [], isLoading } = useRacks(rackParams);
  const updateRack = useUpdateRack();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Rack | null>(null);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();

  const vendorStats = useMemo(() => {
    const total = racks.length || 1;
    const map = new Map<string, number>();
    racks.forEach((rack) => {
      const vendor = rack.supplier_name?.trim() || '공용';
      map.set(vendor, (map.get(vendor) ?? 0) + 1);
    });
    return [...map.entries()].map(([vendor, count]) => ({
      vendor,
      count,
      percent: Math.round((count / total) * 100),
    })).sort((a, b) => b.count - a.count);
  }, [racks]);

  const openEdit = (r: Rack) => {
    setEditing(r);
    form.setFieldsValue({
      name: r.name,
      code: r.code,
      max_capacity: r.max_capacity,
      level_no: r.level_no ?? 1,
      supplier_id: r.supplier_id ?? null,
    });
    setModalOpen(true);
  };

  const handleSubmit = () => {
    if (!editing) return;
    form.validateFields().then((values) => {
      const sup = suppliers.find((s) => s.id === values.supplier_id);
      const data = { ...values, supplier_name: sup?.name ?? null };
      updateRack.mutate(
        { id: editing.id, data },
        {
          onSuccess: () => { message.success('수정됨'); setModalOpen(false); },
          onError: (err) => {
            const detail = (err as { response?: { data?: { error_message?: string; message?: string } } })?.response?.data?.error_message
              ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
              ?? (err instanceof Error ? err.message : '랙 수정에 실패했습니다.');
            message.error({ content: detail, duration: 6 });
          },
        },
      );
    });
  };

  const handleToggle = (r: Rack) => {
    modal.confirm({
      title: `${r.is_active ? '비활성화' : '활성화'}?`,
      onOk: () => updateRack.mutate({ id: r.id, data: { is_active: !r.is_active } }),
    });
  };
  const goDesigner = () => navigate(`/warehouse/layout-editor?wh=${warehouseId}&tab=rack`);

  const columns: ColumnsType<Rack> = [
    { title: '담당 입고처', key: 'supplier_name', width: 130, render: (_, r) => { const v = r.supplier_name || '미지정'; return <Tag color={tagColorByKey(v)}>{v}</Tag>; } },
    { title: '랙코드', dataIndex: 'code', key: 'code', width: 100 },
    { title: '랙명', dataIndex: 'name', key: 'name', width: 120 },
    { title: '최대수용', dataIndex: 'max_capacity', key: 'max_capacity', width: 80, align: 'right' },
    { title: '층수', dataIndex: 'level_no', key: 'level_no', width: 60, align: 'center' },
    { title: '활성화', dataIndex: 'is_active', key: 'is_active', width: 70, align: 'center', render: (v: boolean) => v ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag> },
    { title: 'QR', key: 'qr', width: 50, align: 'center', render: (_, r) => (
      <Popover
        content={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <OrderQrBadge value={`rack:${r.id}`} label={r.code} title="랙 QR" size={120} />
            <Button
              size="small"
              icon={<PrinterOutlined />}
              onClick={() => window.open(
                `/warehouse/rack-labels?wh=${warehouseId}&ids=${r.id}&autoPrint=1`,
                '_blank',
              )}
            >
              라벨 인쇄
            </Button>
          </div>
        }
        trigger="click"
      >
        <Button type="text" size="small" icon={<QrcodeOutlined />} style={{ color: '#64748b' }} />
      </Popover>
    ) },
    { title: '', key: 'action', width: 40, align: 'center', render: (_, r) => (
      <RowActionMenu
        items={[
          { key: 'edit', label: '수정', icon: <EditOutlined />, onClick: () => openEdit(r) },
          r.is_active
            ? { key: 'toggle', label: '비활성화', icon: <StopOutlined />, danger: true, onClick: () => handleToggle(r) }
            : { key: 'toggle', label: '활성화', icon: <PlayCircleOutlined />, onClick: () => handleToggle(r) },
        ]}
      />
    ) },
  ];

  return (
    <div className="warehouse-detail-tab-surface">
      {racks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
          {vendorStats.map((stat) => (
            <Card key={stat.vendor} size="small" styles={{ body: { padding: 12 } }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>입고처 점유율</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{stat.vendor}</div>
              <div style={{ margin: '8px 0 6px', fontSize: 13 }}>랙 {stat.count}개 · {stat.percent}%</div>
              <Progress percent={stat.percent} size="small" showInfo={false} />
            </Card>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <Select placeholder="구역 선택" allowClear style={{ width: 220 }} value={selectedZoneId} onChange={(v) => setSelectedZoneId(v ?? null)}
            options={zones.map((z) => ({ label: `${z.code} — ${z.name}`, value: z.id }))} />
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            랙 생성은 <b>레이아웃 설계</b> 탭에서 가능합니다.
          </span>
        </Space>
        <Space>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => {
              const params = new URLSearchParams({ wh: warehouseId });
              if (selectedZoneId) params.set('zone', selectedZoneId);
              window.open(`/warehouse/rack-labels?${params.toString()}`, '_blank');
            }}
            disabled={!warehouseId}
          >
            랙 라벨 일괄 인쇄
          </Button>
          <Button icon={<LayoutOutlined />} onClick={goDesigner}>레이아웃 설계로 이동</Button>
        </Space>
      </div>

      {racks.length === 0 && !isLoading ? (
        <Empty
          description={
            <div>
              <div style={{ marginBottom: 8, fontSize: 14, color: '#1e2a3a' }}>
                {zones.length === 0 ? '먼저 구역이 필요합니다' : '아직 랙이 없습니다'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                레이아웃 설계 탭의 "② 랙 배치" 서브탭에서 캔버스 위에 배치해주세요.
              </div>
            </div>
          }
        >
          <Button type="primary" icon={<LayoutOutlined />} onClick={goDesigner}>
            레이아웃 설계로 이동
          </Button>
        </Empty>
      ) : (
        <Table columns={columns} dataSource={racks} rowKey="id" loading={isLoading} pagination={{ pageSize: 15 }} />
      )}

      <Modal
        title="랙 수정"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={updateRack.isPending}
        okText="수정"
        width={460}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="랙명" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item
            name="supplier_id"
            label="담당 입고처 (미지정 시 공용)"
            extra="재고가 남아있는 랙은 입고처 변경이 불가합니다. 먼저 재고를 비우거나 다른 랙으로 이동하세요."
          >
            <Select
              allowClear
              placeholder="공용"
              options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="max_capacity" label="최대수용량" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="level_no" label="층수" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
