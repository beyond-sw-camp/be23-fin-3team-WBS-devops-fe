import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Card, Row, Col, Table, Select, Space, Tag, Progress, Empty, Tooltip,
} from 'antd';
import { FireOutlined, DatabaseOutlined, WarningOutlined } from '@ant-design/icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { ColumnsType } from 'antd/es/table';
import type { InventoryStock } from '@/types/inventory';
import { useInventoryStocks } from '@/hooks/useInventoryQuery';
import { useWarehouses } from '@/hooks/useWarehouseQuery';

const { Title, Text } = Typography;

const SATURATION_THRESHOLD = 80;
const TOP_N = 20;

function rateColor(rate: number) {
  if (rate >= 100) return '#ef4444';
  if (rate >= 80) return '#f97316';
  if (rate >= 50) return '#eab308';
  return '#22c55e';
}

function levelLabel(rate: number) {
  if (rate >= 100) return '가득';
  if (rate >= 80) return '임박';
  if (rate >= 50) return '보통';
  return '여유';
}

function usedOf(s: InventoryStock) {
  return s.available_qty + s.reserved_qty + (s.inspecting_qty ?? 0) + s.defective_qty;
}

export default function CapacityAnalysisPage() {
  const navigate = useNavigate();
  const [whIdFilter, setWhIdFilter] = useState<string | undefined>(undefined);
  const { data: warehouses = [] } = useWarehouses();
  const { data: stocks = [], isLoading } = useInventoryStocks({ warehouseId: whIdFilter });

  const warehouseOptions = useMemo(
    () => warehouses
      .filter((w) => w.is_active !== false)
      .map((w) => ({ label: w.name, value: w.id })),
    [warehouses],
  );

  // 수용량이 설정된 row 만 분석 대상
  const capRows = useMemo(
    () => stocks.filter((s) => (s.max_capacity ?? 0) > 0),
    [stocks],
  );
  const noCapCount = stocks.length - capRows.length;

  // 창고별 집계
  const byWarehouse = useMemo(() => {
    const map = new Map<string, { name: string; used: number; cap: number; locations: number }>();
    capRows.forEach((s) => {
      const key = s.warehouse_name || s.warehouse_code || '(미지정)';
      const cur = map.get(key) ?? { name: key, used: 0, cap: 0, locations: 0 };
      cur.used += usedOf(s);
      cur.cap += s.max_capacity ?? 0;
      cur.locations += 1;
      map.set(key, cur);
    });
    return [...map.values()]
      .map((w) => ({
        ...w,
        rate: w.cap > 0 ? Math.min(999, Math.round((w.used / w.cap) * 100)) : 0,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [capRows]);

  // 전체 평균
  const totals = useMemo(() => {
    let used = 0;
    let cap = 0;
    capRows.forEach((s) => { used += usedOf(s); cap += s.max_capacity ?? 0; });
    const avgRate = cap > 0 ? Math.min(999, Math.round((used / cap) * 100)) : 0;
    return { used, cap, avgRate };
  }, [capRows]);

  // 포화 임박 로케이션 (≥80%)
  const saturated = useMemo(() => {
    return capRows
      .map((s) => ({ ...s, _used: usedOf(s), _rate: Math.round((usedOf(s) / (s.max_capacity ?? 1)) * 100) }))
      .filter((s) => s._rate >= SATURATION_THRESHOLD)
      .sort((a, b) => b._rate - a._rate)
      .slice(0, TOP_N);
  }, [capRows]);

  const goRack = (s: InventoryStock) => {
    const whId = warehouses.find((w) => w.code === s.warehouse_code)?.id;
    if (!whId) return;
    navigate(`/warehouse/${whId}?tab=racks&zone=${s.zone_code}&rack=${s.rack_code}`);
  };

  const saturatedColumns: ColumnsType<InventoryStock & { _used: number; _rate: number }> = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 200 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
    { title: '구역', dataIndex: 'zone_name', key: 'zone_name', width: 120 },
    {
      title: '랙·층', key: 'loc', width: 140,
      render: (_, r) => (
        <Space size={4}>
          <Tag color="blue" style={{ margin: 0, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); goRack(r); }}>
            {r.rack_code || '-'}
          </Tag>
          {r.floor_no != null && <span>{r.floor_no}층</span>}
        </Space>
      ),
    },
    {
      title: '사용 / 수용', key: 'qty', width: 130, align: 'right',
      render: (_, r) => (
        <span style={{ color: '#475569' }}>
          {r._used.toLocaleString()} / {(r.max_capacity ?? 0).toLocaleString()}개
        </span>
      ),
    },
    {
      title: '사용률', key: 'rate', width: 200,
      render: (_, r) => {
        const rate = Math.min(100, r._rate);
        const color = rateColor(r._rate);
        return (
          <div style={{ minWidth: 160 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
              <Tag style={{ margin: 0, color, borderColor: `${color}55`, background: `${color}12`, fontWeight: 600 }}>
                {r._rate > 100 ? `초과 ${r._rate}%` : `${levelLabel(r._rate)} ${r._rate}%`}
              </Tag>
            </div>
            <Progress percent={rate} strokeColor={color} showInfo={false} size="small" />
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>수용량 분석</Title>
        <Select
          placeholder="창고 (전체)"
          allowClear
          style={{ width: 220 }}
          value={whIdFilter}
          onChange={setWhIdFilter}
          options={warehouseOptions}
          showSearch
          optionFilterProp="label"
        />
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 14, fontSize: 12 }}>
        로케이션별 최대 수용량(maxCapacity) 대비 실제 사용 수량(가용+예약+검수중+불량)을 집계합니다. 입고예정은 제외.
      </Text>

      {/* 상단 요약 */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        <Col flex={1}>
          <Card size="small">
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>전체 평균 수용률</div>
            {totals.cap > 0 ? (
              <>
                <div style={{ fontSize: 26, fontWeight: 700, color: rateColor(totals.avgRate), lineHeight: 1.2 }}>
                  {totals.avgRate}%
                </div>
                <Progress percent={Math.min(100, totals.avgRate)} strokeColor={rateColor(totals.avgRate)} showInfo={false} size="small" style={{ marginTop: 6, marginBottom: 0 }} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  사용 {totals.used.toLocaleString()} / 수용 {totals.cap.toLocaleString()}개
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: '#9ca3af' }}>수용량 미설정</div>
            )}
          </Card>
        </Col>
        <Col flex={1}>
          <Card size="small">
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>포화 임박 로케이션 (≥{SATURATION_THRESHOLD}%)</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: saturated.length > 0 ? '#f97316' : '#22c55e', lineHeight: 1.2 }}>
              <FireOutlined style={{ marginRight: 6 }} />{saturated.length}건
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
              아래 테이블에서 상세 확인
            </div>
          </Card>
        </Col>
        <Col flex={1}>
          <Card size="small">
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>분석 대상 로케이션</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
              <DatabaseOutlined style={{ marginRight: 6 }} />{capRows.length.toLocaleString()}건
            </div>
            {noCapCount > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                <WarningOutlined style={{ marginRight: 4, color: '#f59e0b' }} />
                수용량 미설정 {noCapCount.toLocaleString()}건은 제외
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 창고별 수용률 차트 */}
      <Card size="small" style={{ marginBottom: 20 }} title="창고별 수용률">
        {byWarehouse.length === 0 ? (
          <Empty description="수용량이 설정된 데이터가 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, byWarehouse.length * 48)}>
            <BarChart layout="vertical" data={byWarehouse} margin={{ top: 8, right: 60, bottom: 8, left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, (max: number) => Math.max(100, max)]} unit="%" />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
              <RTooltip
                formatter={(value, _name, item) => {
                  const payload = item?.payload as { used?: number; cap?: number; locations?: number } | undefined;
                  const rate = typeof value === 'number' ? value : Number(value ?? 0);
                  return [
                    `${rate}% (${(payload?.used ?? 0).toLocaleString()} / ${(payload?.cap ?? 0).toLocaleString()}, 로케이션 ${payload?.locations ?? 0})`,
                    '수용률',
                  ];
                }}
              />
              <Bar dataKey="rate" radius={[0, 4, 4, 0]} barSize={22}>
                {byWarehouse.map((w) => (
                  <Cell key={w.name} fill={rateColor(w.rate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* 포화 임박 로케이션 테이블 */}
      <Card size="small" title={(
        <Space>
          <FireOutlined style={{ color: '#f97316' }} />
          <span>포화 임박 로케이션 Top {TOP_N}</span>
          <Tooltip title="사용률 80% 이상인 로케이션을 사용률 높은 순으로 표시">
            <Text type="secondary" style={{ fontSize: 12 }}>(≥{SATURATION_THRESHOLD}%)</Text>
          </Tooltip>
        </Space>
      )}>
        <Table
          columns={saturatedColumns}
          dataSource={saturated}
          rowKey={(r) => `${r.id}`}
          size="small"
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: '포화 임박 로케이션이 없습니다' }}
        />
      </Card>
    </>
  );
}
