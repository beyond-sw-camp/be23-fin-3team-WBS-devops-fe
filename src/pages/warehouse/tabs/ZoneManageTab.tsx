import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Modal, Form, Select, InputNumber, Input, App, Card, Empty } from 'antd';
import { EditOutlined, StopOutlined, LayoutOutlined, PlayCircleOutlined } from '@ant-design/icons';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import type { Zone, ZoneType } from '@/types/warehouse';
import { useZonesByWarehouse, useUpdateZone } from '@/hooks/useWarehouseQuery';
import { ZONE_TYPE_COLOR, ZONE_TYPE_LABEL } from '@/utils/labels';
import { tagColorByKey } from '@/utils/badgeColor';

const CATEGORY_OPTS = ['전자기기', '가전제품', '생활용품', '반품', '폐기'];

export default function ZoneManageTab({ warehouseId }: { warehouseId: string }) {
  const navigate = useNavigate();
  const { data: zones = [], isLoading } = useZonesByWarehouse(warehouseId);
  const updateZone = useUpdateZone();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();

  const sorted = [...zones].sort((a, b) => a.sort_order - b.sort_order);
  const categoryStats = sorted.reduce<Record<string, { zones: number; racks: number }>>((acc, z) => {
    const key = z.category_major?.trim() || '미지정';
    if (!acc[key]) acc[key] = { zones: 0, racks: 0 };
    acc[key].zones += 1;
    acc[key].racks += z.rack_count ?? 0;
    return acc;
  }, {});

  const openEdit = (r: Zone) => {
    setEditing(r);
    form.setFieldsValue({
      name: r.name,
      code: r.code,
      category_major: r.category_major,
      zone_type: r.zone_type,
      sort_order: r.sort_order,
    });
    setModalOpen(true);
  };

  const handleSubmit = () => {
    if (!editing) return;
    form.validateFields().then((values) => {
      updateZone.mutate(
        { id: editing.id, data: values },
        { onSuccess: () => { message.success('수정됨'); setModalOpen(false); } },
      );
    });
  };

  const handleToggle = (r: Zone) => {
    const action = r.is_active ? '비활성화' : '활성화';
    modal.confirm({
      title: `${action}?`,
      onOk: () => updateZone.mutate(
        { id: r.id, data: { is_active: !r.is_active } },
        { onSuccess: () => message.success(`${action}됨`) },
      ),
    });
  };

  const goDesigner = () => navigate(`/warehouse/layout-editor?wh=${warehouseId}&tab=zone`);

  const columns: ColumnsType<Zone> = [
    { title: '코드', dataIndex: 'code', key: 'code', width: 80 },
    { title: '카테고리', dataIndex: 'category_major', key: 'category_major', width: 120, render: (v?: string) => <Tag color={tagColorByKey(v)}>{v || '미지정'}</Tag> },
    { title: '구역명', dataIndex: 'name', key: 'name', width: 160 },
    { title: '유형', dataIndex: 'zone_type', key: 'zone_type', width: 90, align: 'center', render: (v: ZoneType) => <Tag color={ZONE_TYPE_COLOR[v]}>{ZONE_TYPE_LABEL[v]}</Tag> },
    { title: '랙수', dataIndex: 'rack_count', key: 'rack_count', width: 60, align: 'center' },
    { title: '정렬', dataIndex: 'sort_order', key: 'sort_order', width: 50, align: 'center' },
    { title: '활성화', dataIndex: 'is_active', key: 'is_active', width: 70, align: 'center', render: (v: boolean) => v ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag> },
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
      {zones.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
          {Object.entries(categoryStats).map(([category, stat]) => (
            <Card key={category} size="small" styles={{ body: { padding: 12 } }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>카테고리</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{category}</div>
              <div style={{ marginTop: 8, fontSize: 13 }}>
                구역 {stat.zones}개 · 랙 {stat.racks}개
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>
          구역 생성은 <b>레이아웃 설계</b> 탭에서 가능합니다. 이 탭에서는 이미 만든 구역의 메타데이터만 편집할 수 있습니다.
        </span>
        <Button icon={<LayoutOutlined />} onClick={goDesigner}>레이아웃 설계로 이동</Button>
      </div>

      {zones.length === 0 && !isLoading ? (
        <Empty
          description={
            <div>
              <div style={{ marginBottom: 8, fontSize: 14, color: '#1e2a3a' }}>아직 구역이 없습니다</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                레이아웃 설계 탭에서 캔버스 위에 드래그하여 첫 구역을 만들어주세요.
              </div>
            </div>
          }
        >
          <Button type="primary" icon={<LayoutOutlined />} onClick={goDesigner}>
            레이아웃 설계로 이동
          </Button>
        </Empty>
      ) : (
        <Table columns={columns} dataSource={sorted} rowKey="id" loading={isLoading} pagination={false} />
      )}

      <Modal
        title="구역 수정"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={updateZone.isPending}
        okText="수정"
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="category_major" label="상품 카테고리(대분류)" rules={[{ required: true, message: '카테고리를 선택하세요' }]}>
            <Select options={CATEGORY_OPTS.map((v) => ({ label: v, value: v }))} />
          </Form.Item>
          <Form.Item name="name" label="구역명" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="zone_type" label="구역유형" rules={[{ required: true }]}>
            <Select options={Object.entries(ZONE_TYPE_LABEL).map(([v, l]) => ({ label: l, value: v }))} />
          </Form.Item>
          <Form.Item name="sort_order" label="정렬순서" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
