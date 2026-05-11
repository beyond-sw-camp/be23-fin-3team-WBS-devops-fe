import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Form,
  Input,
  Switch,
  App,
  Card,
  Row,
  Col,
  Progress,
  Divider,
  Modal,
  Spin,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  EditOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  UserOutlined,
  CalendarOutlined,
  PartitionOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { Warehouse } from '@/types/warehouse';
import { useWarehouseDetail, useUpdateWarehouse, useZonesByWarehouse, useRacks } from '@/hooks/useWarehouseQuery';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import { warehouseInventorySummary } from '@/utils/inventoryGuard';
import './warehouseInfoTab.css';

const { Paragraph, Text } = Typography;

function formatDateDot(iso?: string): string {
  if (!iso) return '—';
  return iso.replace(/-/g, '.');
}

/** 창고 건강 상태용 요약 배지 (규칙 기반) */
function healthStatusBadges(wh: Warehouse, utilNum: number | null) {
  const items: { key: string; color?: string; children: string }[] = [];
  if (wh.is_active) items.push({ key: 'on', color: 'success', children: '가동 중' });
  else items.push({ key: 'off', color: 'default', children: '운영 중지' });
  if (wh.zone_count === 0) items.push({ key: 'noz', color: 'warning', children: '구역 미등록' });
  if (utilNum != null && wh.rack_count > 0 && utilNum >= 85) {
    items.push({ key: 'dense', color: 'orange', children: '랙 밀집 · 점검 권장' });
  }
  if (utilNum != null && wh.rack_count > 0 && utilNum <= 30) {
    items.push({ key: 'free', color: 'processing', children: '적재 여유' });
  }
  return items;
}

export default function WarehouseInfoTab({ warehouseId }: { warehouseId: string }) {
  const navigate = useNavigate();
  const { data: wh, isLoading } = useWarehouseDetail(warehouseId);
  const { data: zones = [] } = useZonesByWarehouse(warehouseId);
  const { data: racks = [] } = useRacks({ warehouseId });
  const { data: inventoryByRack } = useInventoryByRack(warehouseId);
  const updateMutation = useUpdateWarehouse();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();

  const utilNum = useMemo(() => {
    if (wh?.rack_utilization_percent != null) {
      return Math.min(100, Math.max(0, wh.rack_utilization_percent));
    }
    const groups = inventoryByRack?.racks;
    if (!groups || groups.length === 0) return null;
    let used = 0;
    let cap = 0;
    for (const g of groups) {
      for (const loc of g.locations) {
        if (loc.max_capacity == null || loc.max_capacity <= 0) continue;
        cap += loc.max_capacity;
        used += loc.total_qty;
      }
    }
    if (cap === 0) return null;
    return Math.min(100, Math.max(0, Math.round((used / cap) * 100)));
  }, [wh?.rack_utilization_percent, inventoryByRack]);

  const badges = useMemo(() => (wh ? healthStatusBadges(wh, utilNum) : []), [wh, utilNum]);
  const categoryTop = useMemo(() => {
    const map = new Map<string, number>();
    zones.forEach((z) => map.set(z.category_major || '미지정', (map.get(z.category_major || '미지정') ?? 0) + (z.rack_count ?? 0)));
    const [name, count] = [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['미지정', 0];
    return { name, count };
  }, [zones]);
  const vendorTop = useMemo(() => {
    const map = new Map<string, number>();
    racks.forEach((r) => map.set(r.supplier_name || '미지정', (map.get(r.supplier_name || '미지정') ?? 0) + (r.max_capacity ?? 0)));
    const [name, cap] = [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['미지정', 0];
    return { name, cap };
  }, [racks]);

  const rackSummaryLines = useMemo(() => {
    if (!wh) return { title: '', lines: [] as string[] };
    if (utilNum == null) {
      return {
        title: '전체 랙 사용 현황 요약',
        lines: [
          `등록 랙 ${wh.rack_count}개 기준으로 집계된 사용률 데이터가 없습니다.`,
          '연동 후 추정 사용률이 표시됩니다.',
        ],
      };
    }
    return {
      title: '전체 랙 사용 현황 요약',
      lines: [
        `구역 ${wh.zone_count}개 · 랙 ${wh.rack_count}개를 기준으로 한 창고 전체 추정 적재율입니다.`,
        utilNum >= 85
          ? '밀집 구간이 있을 수 있으니 구역별 여유는 [구역 관리]에서 확인하세요.'
          : utilNum <= 30 && wh.rack_count > 0
            ? '전반적으로 적재 여유가 있습니다.'
            : '정상 범위에서 운영 중인 것으로 보입니다.',
      ],
    };
  }, [wh, utilNum]);

  const openEdit = () => {
    if (!wh) return;
    setModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (wh?.is_active && values.is_active === false) {
        const { hasInventory, occupiedRackCodes } = warehouseInventorySummary(inventoryByRack);
        if (hasInventory) {
          const preview = occupiedRackCodes.slice(0, 5).join(', ');
          const more = occupiedRackCodes.length > 5 ? ` 외 ${occupiedRackCodes.length - 5}개` : '';
          modal.warning({
            title: '비활성화할 수 없습니다',
            content: `창고 내 랙(${preview}${more})에 재고가 남아있습니다. 재고를 비우거나 다른 창고로 이동한 뒤 다시 시도하세요.`,
          });
          return;
        }
      }
      await updateMutation.mutateAsync({
        id: warehouseId,
        data: { ...values, updated_at: new Date().toISOString().slice(0, 10) },
      });
      message.success('수정되었습니다.');
      setModalOpen(false);
    } catch {
      /* validation 또는 API 오류 */
    }
  };

  if (isLoading || !wh) {
    return (
      <div className="warehouse-info-dashboard" style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="warehouse-info-dashboard">
      <div className="warehouse-info-dashboard__inner">
        <Card className="warehouse-info-dashboard__hero">
          <Row gutter={[36, 0]} align="stretch">
            <Col xs={24} md={12}>
              <h2 className="warehouse-info-dashboard__spec-head">창고 상세 스펙</h2>
              <dl className="warehouse-info-dashboard__spec-list">
                <div className="warehouse-info-dashboard__spec-row">
                  <dt className="warehouse-info-dashboard__spec-dt">
                    <EnvironmentOutlined style={{ marginRight: 6 }} />
                    주소
                  </dt>
                  <dd className="warehouse-info-dashboard__spec-dd warehouse-info-dashboard__spec-dd--muted">{wh.address}</dd>
                </div>
                <div className="warehouse-info-dashboard__spec-row">
                  <dt className="warehouse-info-dashboard__spec-dt">
                    <UserOutlined style={{ marginRight: 6 }} />
                    담당자
                  </dt>
                  <dd className="warehouse-info-dashboard__spec-dd">{wh.manager_name?.trim() || '—'}</dd>
                </div>
                <div className="warehouse-info-dashboard__spec-row">
                  <dt className="warehouse-info-dashboard__spec-dt">
                    <PhoneOutlined style={{ marginRight: 6 }} />
                    연락처
                  </dt>
                  <dd className="warehouse-info-dashboard__spec-dd">{wh.phone?.trim() || '—'}</dd>
                </div>
                <div className="warehouse-info-dashboard__spec-row">
                  <dt className="warehouse-info-dashboard__spec-dt">
                    <AppstoreOutlined style={{ marginRight: 6 }} />
                    구역 수
                  </dt>
                  <dd className="warehouse-info-dashboard__spec-dd">{wh.zone_count}</dd>
                </div>
                <div className="warehouse-info-dashboard__spec-row">
                  <dt className="warehouse-info-dashboard__spec-dt">
                    <DatabaseOutlined style={{ marginRight: 6 }} />
                    랙 수
                  </dt>
                  <dd className="warehouse-info-dashboard__spec-dd">{wh.rack_count}</dd>
                </div>
                <div className="warehouse-info-dashboard__spec-row">
                  <dt className="warehouse-info-dashboard__spec-dt">
                    <CalendarOutlined style={{ marginRight: 6 }} />
                    최근 수정
                  </dt>
                  <dd className="warehouse-info-dashboard__spec-dd">{formatDateDot(wh.updated_at)}</dd>
                </div>
                <div className="warehouse-info-dashboard__spec-row">
                  <dt className="warehouse-info-dashboard__spec-dt">특이사항</dt>
                  <dd className="warehouse-info-dashboard__spec-dd warehouse-info-dashboard__spec-dd--muted" style={{ whiteSpace: 'pre-wrap' }}>
                    {wh.notes?.trim() || '—'}
                  </dd>
                </div>
              </dl>
            </Col>
            <Col xs={24} md={12}>
              <div className="warehouse-info-dashboard__graph-panel">
                <div className="warehouse-info-dashboard__graph-title">실시간 사용률 (추정)</div>
                <div className="warehouse-info-dashboard__graph-summary">
                  <Text strong className="warehouse-info-dashboard__graph-summary-title">
                    {rackSummaryLines.title}
                  </Text>
                  {rackSummaryLines.lines.map((line, i) => (
                    <Paragraph key={i} className="warehouse-info-dashboard__graph-summary-line">
                      {line}
                    </Paragraph>
                  ))}
                </div>
                <div className="warehouse-info-dashboard__progress-center">
                  {utilNum == null ? (
                    <div className="warehouse-info-dashboard__graph-empty">집계 데이터 없음</div>
                  ) : (
                    <>
                      <Progress
                        type="circle"
                        percent={utilNum}
                        width={156}
                        strokeWidth={8}
                        strokeColor={
                          utilNum > 85
                            ? { '0%': '#fa8c16', '100%': '#fa541c' }
                            : { '0%': '#1677ff', '100%': '#36cfc9' }
                        }
                        format={(p) => (
                          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                            <span className="warehouse-info-dashboard__progress-num">{p}</span>
                            <span className="warehouse-info-dashboard__progress-pct">%</span>
                          </span>
                        )}
                      />
                      <div className="warehouse-info-dashboard__progress-linear">
                        <Progress
                          percent={utilNum}
                          strokeColor={utilNum > 85 ? '#fa8c16' : '#1677ff'}
                          showInfo={false}
                          size={['100%', 8]}
                        />
                      </div>
                      <div className="warehouse-info-dashboard__graph-foot">
                        구역·랙 단위 목록 및 수정은 <Text strong>[구역 관리]</Text> 탭에서 하세요.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Col>
          </Row>

          <Divider style={{ margin: '24px 0 18px' }} />

          <Space size="middle" wrap>
            <Button type="primary" icon={<EditOutlined />} onClick={openEdit}>
              정보 수정
            </Button>
            <Button icon={<PartitionOutlined />} onClick={() => navigate(`/warehouse/layout-editor?tab=zone&wh=${warehouseId}`)}>
              레이아웃 편집기
            </Button>
          </Space>
          <Divider style={{ margin: '18px 0 12px' }} />
          <Row gutter={[10, 10]}>
            <Col xs={24} md={12}>
              <Card size="small">
                <Text type="secondary">카테고리 최다 점유</Text>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{categoryTop.name}</div>
                <Text style={{ fontSize: 13 }}>랙 {categoryTop.count}개</Text>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small">
                <Text type="secondary">최대 입고처 랙 용량</Text>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{vendorTop.name}</div>
                <Text style={{ fontSize: 13 }}>총 {vendorTop.cap.toLocaleString()} capacity</Text>
              </Card>
            </Col>
          </Row>
        </Card>

        <div className="warehouse-info-dashboard__status-strip">
          <div className="warehouse-info-dashboard__status-strip-badges">
            <span className="warehouse-info-dashboard__status-strip-label">
              <CheckCircleOutlined /> 운영 상태
            </span>
            <Space size={[10, 8]} wrap>
              {badges.map((b) => (
                <Tag key={b.key} color={b.color} className="warehouse-info-dashboard__status-tag">
                  {b.children}
                </Tag>
              ))}
            </Space>
          </div>
          <div className="warehouse-info-dashboard__status-strip-meta">
            <span className="warehouse-info-dashboard__status-strip-meta-label">최근 정보 반영</span>
            <span className="warehouse-info-dashboard__status-strip-meta-value">{formatDateDot(wh.updated_at)}</span>
            <span className="warehouse-info-dashboard__status-strip-hint">기본정보·집계 기준일 (참고)</span>
          </div>
        </div>
      </div>

      <Modal
        title="창고 정보 수정"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleModalOk}
        confirmLoading={updateMutation.isPending}
        okText="저장"
        cancelText="취소"
        width={560}
        destroyOnHidden
        afterOpenChange={(open) => {
          if (open && wh) {
            form.setFieldsValue({
              name: wh.name,
              code: wh.code,
              address: wh.address,
              is_active: wh.is_active,
              manager_name: wh.manager_name ?? '',
              phone: wh.phone ?? '',
              notes: wh.notes ?? '',
            });
          }
        }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} preserve={false}>
          <Form.Item name="name" label="창고명" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="code" label="창고코드">
            <Input size="large" disabled />
          </Form.Item>
          <Form.Item name="address" label="주소" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="manager_name" label="담당자">
            <Input size="large" placeholder="이름 또는 팀명" />
          </Form.Item>
          <Form.Item name="phone" label="연락처">
            <Input size="large" placeholder="전화번호" />
          </Form.Item>
          <Form.Item name="notes" label="특이사항">
            <Input.TextArea rows={3} placeholder="운영 메모, 제약 사항 등" />
          </Form.Item>
          <Form.Item name="is_active" label="활성화" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
