import { useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Typography, Tabs, Button, Tag, Spin, Result } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useWarehouseDetail } from '@/hooks/useWarehouseQuery';
import WarehouseInfoTab from './tabs/WarehouseInfoTab';
import ZoneManageTab from './tabs/ZoneManageTab';
import RackManageTab from './tabs/RackManageTab';
import WarehouseSafetyStockTab from './tabs/WarehouseSafetyStockTab';
import './warehouseDetailPage.css';

const { Text } = Typography;

const DETAIL_TAB_KEYS = ['info', 'zones', 'racks', 'safety-stocks'] as const;
type DetailTabKey = (typeof DETAIL_TAB_KEYS)[number];

function isDetailTabKey(v: string): v is DetailTabKey {
  return (DETAIL_TAB_KEYS as readonly string[]).includes(v);
}

/** 이전 경로/북마크 호환 — 레이아웃 편집은 전용 허브 페이지로 이동 */
const LEGACY_REDIRECT_TABS = new Set(['designer', 'layout', 'zone', 'rack', 'monitoring']);

export default function WarehouseDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'info';

  const { data: warehouse, isLoading } = useWarehouseDetail(id);

  useEffect(() => {
    if (isDetailTabKey(rawTab)) return;
    if (LEGACY_REDIRECT_TABS.has(rawTab)) {
      // 레이아웃 편집 허브로 리다이렉트 (창고 파라미터 포함)
      navigate(`/warehouse/layout-editor?wh=${id}&tab=zone`, { replace: true });
      return;
    }
    setSearchParams({ tab: 'info' }, { replace: true });
  }, [rawTab, id, navigate, setSearchParams]);

  const activeTab: DetailTabKey = isDetailTabKey(rawTab) ? rawTab : 'info';

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  if (!warehouse) return <Result status="404" title="창고를 찾을 수 없습니다" extra={<Button onClick={() => navigate('/warehouse/list')}>목록으로</Button>} />;

  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key });
  };

  return (
    <div className="warehouse-page-shell warehouse-detail-page__inner">
      <div className="warehouse-detail-page__header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/warehouse/list')}>목록</Button>
        <Text strong style={{ fontSize: 17, color: '#343a40' }}>{warehouse.name}</Text>
        <Tag style={{ fontSize: 13 }}>{warehouse.code}</Tag>
        {warehouse.is_active ? <Tag color="green" style={{ fontSize: 13 }}>활성</Tag> : <Tag style={{ fontSize: 13 }}>비활성</Tag>}
      </div>

      <Tabs
        className="warehouse-detail-page__tabs"
        activeKey={activeTab}
        onChange={handleTabChange}
        centered={false}
        destroyOnHidden
        items={[
          { key: 'info', label: '기본정보', children: <WarehouseInfoTab warehouseId={id} /> },
          { key: 'zones', label: '구역 목록', children: <ZoneManageTab warehouseId={id} /> },
          { key: 'racks', label: '랙 목록', children: <RackManageTab warehouseId={id} /> },
          { key: 'safety-stocks', label: '안전재고', children: <WarehouseSafetyStockTab warehouseId={id} /> },
        ]}
      />
    </div>
  );
}
