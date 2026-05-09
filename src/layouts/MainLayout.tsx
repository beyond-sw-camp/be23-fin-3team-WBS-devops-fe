import { useState, useMemo, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Breadcrumb, Button, Space, Dropdown, theme, App } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useStompSubscription } from '@/hooks/useStompSubscription';
import {
  DashboardOutlined,
  TeamOutlined,
  HomeOutlined,
  ImportOutlined,
  ExportOutlined,
  SwapOutlined,
  DatabaseOutlined,
  LineChartOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  LockOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CodeOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useAuthStore } from '@/stores/authStore';
import { getClientIdFromToken } from '@/utils/jwt';
import { useSoShortageCount, useSoShortageStore } from '@/stores/soShortageStore';
import { useLowStockCount, useLowStockStore, type LowStockPayload } from '@/stores/lowStockStore';
import { getSoShortageBaseline } from '@/api/alert';
import { getLowStockItems } from '@/api/statistics';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import FloatingChatbot from '@/components/ai-chatbot/FloatingChatbot';
import SessionTimer from '@/components/SessionTimer';
import NotificationBellPopover from '@/components/NotificationBellPopover';
import MyActivitySider from '@/components/MyActivitySider';
import '@/pages/warehouse/warehouseLayoutEditor.css';

const { Header, Sider, Content } = Layout;

interface MenuChild {
  key: string;
  label: string;
  adminOnly?: boolean;
}

interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  resource?: string;
  adminOnly?: boolean;
  children?: MenuChild[];
}

const MENU_DEFS: MenuItem[] = [
  { key: '/', icon: <DashboardOutlined />, label: '대시보드' },
  {
    key: 'master', icon: <TeamOutlined />, label: '마스터 관리', resource: 'MASTER',
    children: [
      { key: '/master/suppliers', label: '입고처 관리' },
      { key: '/master/stores', label: '출고처 관리' },
      { key: '/master/products', label: '상품 관리' },
      { key: '/master/product-groups', label: '상품 그룹 관리' },
      { key: '/master/product-categories', label: '카테고리 관리' },
      { key: '/master/safety-stocks', label: '안전재고 관리' },
      { key: '/master/option-types', label: '옵션 관리', adminOnly: true },
    ],
  },
  {
    key: 'warehouse', icon: <HomeOutlined />, label: '창고 관리', resource: 'MASTER',
    children: [
      { key: '/warehouse/list', label: '창고 목록' },
      { key: '/warehouse/layout-editor', label: '레이아웃 편집' },
    ],
  },
  {
    key: 'warehouse-monitoring', icon: <HomeOutlined />, label: '창고 모니터링', resource: 'INVENTORY',
    children: [
      { key: '/warehouse/monitoring', label: '재고 위치 조회' },
    ],
  },
  {
    key: 'inbound', icon: <ImportOutlined />, label: '입고 관리', resource: 'INBOUND',
    children: [
      { key: '/order/inbound', label: '입고 지시서' },
      { key: '/order/inbound/placements', label: '적치 지시서' },
      { key: '/order/inbound/receipts', label: '입고전표 조회' },
      { key: '/etc-inout/in', label: '기타 입고' },
    ],
  },
  {
    key: 'outbound', icon: <ExportOutlined />, label: '출고 관리', resource: 'OUTBOUND',
    children: [
      { key: '/order/outbound', label: '출고 지시서' },
      { key: '/order/picking', label: '피킹 리스트' },
      { key: '/etc-inout/out', label: '기타 출고' },
      { key: '/order/outbound/dispatches', label: '출고전표 조회' },
      { key: '/order/sales-orders/shortage', label: '출고 불가 수주' },
    ],
  },
  {
    key: 'return', icon: <RollbackOutlined />, label: '반품 관리',
    children: [
      { key: '/order/return-inbound/list', label: '반품 입고 목록' },
      { key: '/order/return-inbound', label: '반품 입고 접수' },
      { key: '/order/return-outbound/list', label: '반품 출고 목록' },
      { key: '/order/return-outbound', label: '반품 출고 접수' },
    ],
  },
  {
    key: 'transfer', icon: <SwapOutlined />, label: '이동 관리', resource: 'TRANSFER',
    children: [
      { key: '/order/transfer', label: '이동 지시서' },
    ],
  },
  {
    key: 'integrated-orders', icon: <UnorderedListOutlined />, label: '지시서 목록',
    children: [
      { key: '/orders/integrated', label: '전체 지시서 목록' },
    ],
  },
  {
    key: 'documents', icon: <FileTextOutlined />, label: '문서/증빙 관리',
    children: [
      { key: '/documents/official', label: '공식 문서함' },
      { key: '/documents/evidence', label: '작업 증빙' },
    ],
  },
  {
    key: 'inventory', icon: <DatabaseOutlined />, label: '재고 관리', resource: 'INVENTORY',
    children: [
      { key: '/inventory/stocks', label: '재고 현황' },
      { key: '/inventory/stock-count', label: '재고 실사' },
      { key: '/common/low-stock', label: '재고 부족 품목' },
    ],
  },
  {
    key: 'statistics', icon: <LineChartOutlined />, label: '통계', resource: 'STATISTICS',
    children: [
      { key: '/statistics/inout', label: '입출고 현황' },
      { key: '/statistics/turnover', label: '재고 회전율' },
      { key: '/statistics/ranking', label: '품번별 출고 순위' },
      // 수용량 분석은 창고 모니터링 페이지의 탭으로 이동됨
    ],
  },
  {
    key: 'common', icon: <AppstoreOutlined />, label: '공통 관리', adminOnly: true,
    children: [
      { key: '/common/notifications', label: '알림 관리' },
      { key: '/common/audit-logs', label: '감사 로그' },
      { key: '/common/batch', label: '배치 관리' },
    ],
  },
  {
    key: 'settings', icon: <SettingOutlined />, label: '설정', adminOnly: true,
    children: [
      { key: '/settings/users', label: '사용자 관리' },
      { key: '/settings/roles', label: '역할 관리' },
    ],
  },
];

function useSiderMenuItems(): MenuProps['items'] {
  const { currentRole, hasPermission } = useAuth();

  if (currentRole === 'DEVELOPER') {
    return [
      {
        key: 'developer-clients',
        icon: <CodeOutlined />,
        label: 'Developer',
        children: [
          { key: '/developer/clients', label: '회사 목록' },
          { key: '/developer/clients/new', label: '회사 등록' },
        ],
      },
    ];
  }

  const isAdmin = currentRole === 'ADMIN';

  return MENU_DEFS
    .filter((m) => {
      if (m.adminOnly && !isAdmin) return false;
      if (!m.resource) return true;
      return hasPermission(m.resource);
    })
    .map(({ resource: _, adminOnly: __, children, ...rest }) => ({
      ...rest,
      ...(children
        ? {
            children: children
              .filter((c) => !c.adminOnly || isAdmin)
              .map(({ adminOnly: _a, ...c }) => c),
          }
        : {}),
    })) as MenuProps['items'];
}

// 경로 → 브레드크럼 매핑
const breadcrumbMap: Record<string, string> = {
  '/': '대시보드',
  '/master/suppliers': '입고처 관리',
  '/master/stores': '출고처 관리',
  '/master/products': '상품 관리',
  '/master/product-groups': '상품 그룹 관리',
  '/master/product-categories': '카테고리 관리',
  '/master/safety-stocks': '안전재고 관리',
  '/master/option-types': '옵션 관리',
  '/warehouse/list': '창고 목록',
  '/warehouse/layout-editor': '레이아웃 편집',
  '/warehouse/monitoring': '창고 모니터링',
  '/order/inbound': '입고 지시서',
  '/order/inbound/placements': '적치 지시서',
  '/etc-inout/in': '기타 입고',
  '/etc-inout/out': '기타 출고',
  '/order/inbound/receipts': '입고전표 조회',
  '/etc-inout': '기타입출고 관리',
  '/order/outbound': '출고 지시서',
  '/order/picking': '피킹 리스트',
  '/order/outbound/dispatches': '출고전표 조회',
  '/order/sales-orders/shortage': '출고 불가 수주',
  '/order/transfer': '이동 지시서',
  '/order/return-inbound': '반품 입고 접수',
  '/order/return-inbound/list': '반품 입고 목록',
  '/order/return-outbound': '반품 출고 접수',
  '/order/return-outbound/list': '반품 출고 목록',
  '/orders/integrated': '지시서 목록',
  '/documents/official': '공식 문서함',
  '/documents/evidence': '작업 증빙',
  '/inventory/stocks': '재고 현황',
  '/inventory/stock-count': '재고 실사',
  '/statistics/inout': '입출고 현황',
  '/statistics/turnover': '재고 회전율',
  '/statistics/ranking': '품번별 출고 순위',
  '/statistics/capacity': '수용량 분석',
  '/common/notifications': '알림 관리',
  '/common/audit-logs': '감사 로그',
  '/common/batch': '배치 관리',
  '/settings/users': '사용자 관리',
  '/settings/roles': '역할 관리',
  '/developer': 'Developer Console',
  '/developer/clients': '회사 목록',
  '/developer/clients/new': '회사 등록',
  '/my/profile': '내 프로필',
  '/my/password': '비밀번호 변경',
};

const parentMap: Record<string, string> = {
  master: '마스터 관리',
  warehouse: '창고 관리',
  order: '주문 관리',
  documents: '문서/증빙 관리',
  inventory: '재고 관리',
  statistics: '통계',
  common: '공통 관리',
  settings: '설정',
  my: '내 계정',
  developer: 'Developer',
};

function useBreadcrumbItems(pathname: string) {
  const items: { title: string }[] = [{ title: '홈' }];
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    items.push({ title: '대시보드' });
    return items;
  }
  if (segments[0] && parentMap[segments[0]]) {
    items.push({ title: parentMap[segments[0]] });
  }
  // exact 매칭 우선
  if (breadcrumbMap[pathname]) {
    items.push({ title: breadcrumbMap[pathname] });
    return items;
  }
  // 상세 페이지(/order/inbound/{id} 등) — 두 번째 segment 까지의 부모 경로 매칭
  if (segments.length >= 2) {
    const parentPath = '/' + segments.slice(0, 2).join('/');
    if (breadcrumbMap[parentPath]) {
      items.push({ title: breadcrumbMap[parentPath] });
    }
  }
  return items;
}

interface LowStockAlertEvent {
  type: 'low_stock_added' | 'low_stock_resolved';
  productId: string;
  productName: string;
  sku: string;
  warehouseId: string;
  warehouseName: string | null;
  availableQty: number;
  minStockQty: number;
}

interface SoShortageEvent {
  type: 'so_shortage_added' | 'so_shortage_resolved';
  salesOrderId: string;
  soNo: string;
  scheduledDate: string;
  storeName: string;
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    requiredQty: number;
    availableQty: number;
    shortageQty: number;
  }>;
}

type AdminAlertEvent = LowStockAlertEvent | SoShortageEvent;

function isSoShortageEvent(e: AdminAlertEvent): e is SoShortageEvent {
  return e.type === 'so_shortage_added' || e.type === 'so_shortage_resolved';
}

function isLowStockEvent(e: AdminAlertEvent): e is LowStockAlertEvent {
  return e.type === 'low_stock_added' || e.type === 'low_stock_resolved';
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isLoggedIn } = useAuthStore();
  const siderMenuItems = useSiderMenuItems();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();

  // 우측 "내 활동" 사이드바 — localStorage 로 접힘 상태 유지
  const ACTIVITY_COLLAPSED_KEY = 'main:activitySider:collapsed';
  const [activityCollapsed, setActivityCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(ACTIVITY_COLLAPSED_KEY) === '1';
  });
  const toggleActivitySider = (next: boolean) => {
    setActivityCollapsed(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVITY_COLLAPSED_KEY, next ? '1' : '0');
    }
  };

  // 실시간 알림 — BE AlertService 가 push 하는 단일 채널.
  //   payload.type 으로 분기:
  //     low_stock_added / low_stock_resolved / so_shortage_added / so_shortage_resolved
  const clientId = useMemo(() => getClientIdFromToken(), [isLoggedIn]);
  const alertDestination = clientId ? `/topic/admin/alerts/${clientId}` : null;
  const addSoShortage = useSoShortageStore((s) => s.addShortage);
  const resolveSoShortage = useSoShortageStore((s) => s.resolveShortage);
  const setSoShortages = useSoShortageStore((s) => s.setShortages);
  const addLowStock = useLowStockStore((s) => s.addShortage);
  const resolveLowStock = useLowStockStore((s) => s.resolveShortage);
  const setLowStocks = useLowStockStore((s) => s.setShortages);
  const soShortageCount = useSoShortageCount();
  const lowStockCount = useLowStockCount();
  const notificationCount = soShortageCount + lowStockCount;

  // Baseline 조회 — 로그인 후 진입/새로고침 시 현재 부족 SO 전체를 한번 받아 store seed.
  // 그 후 WS 이벤트가 added/resolved 로 갱신.
  const { data: shortageBaseline } = useQuery({
    queryKey: ['so-shortage-baseline', clientId],
    queryFn: getSoShortageBaseline,
    enabled: !!clientId,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (shortageBaseline) setSoShortages(shortageBaseline);
  }, [shortageBaseline, setSoShortages]);

  // Low-stock baseline — 동일 패턴. REST 응답엔 type 필드 없음 (NON_NULL 제외).
  // snake_case LowStockItem → camelCase LowStockPayload 로 변환해서 store seed.
  const { data: lowStockBaseline } = useQuery({
    queryKey: ['low-stock-baseline', clientId],
    queryFn: getLowStockItems,
    enabled: !!clientId,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (!lowStockBaseline) return;
    const seed: LowStockPayload[] = lowStockBaseline.map((it) => ({
      productId: it.product_id,
      productName: it.product_name,
      sku: it.sku,
      warehouseId: it.warehouse_id,
      warehouseName: it.warehouse_name,
      availableQty: it.available_qty,
      minStockQty: it.min_stock_qty,
    }));
    setLowStocks(seed);
  }, [lowStockBaseline, setLowStocks]);

  useStompSubscription<AdminAlertEvent>(alertDestination, (event) => {
    if (isSoShortageEvent(event)) {
      // SO 출고 불가 알림 — added/resolved 양쪽 처리.
      //
      // 토스트 suppress 정책 — 폭격 방지:
      //  1. baseline (REST) 도착 전(isInitialized=false): WS added 가 와도 토스트 X, store 만 누적
      //     → baseline 호출이 BE refresh 를 트리거하면서 모든 부족 SO 가 added 로 push 되는데
      //       그게 다 토스트로 뜨면 화면 폭격됨
      //  2. baseline 후라도 store 에 이미 같은 SO 가 있으면 (중복 push) 토스트 skip
      //     → 진짜 "새로 발생한 부족" 만 알림
      const head = event.items[0];
      const more = event.items.length > 1 ? ` 외 ${event.items.length - 1}건` : '';
      const storeState = useSoShortageStore.getState();
      const wasAlreadyKnown = storeState.shortages.has(event.salesOrderId);
      const isInitialized = storeState.isInitialized;

      if (event.type === 'so_shortage_added') {
        addSoShortage(event);
        if (isInitialized && !wasAlreadyKnown) {
          notification.warning({
            message: `🔴 출고 어려움: ${event.soNo} · ${event.storeName}`,
            description: head
              ? `${head.productName} ${head.shortageQty}개 부족${more}`
              : '재고 부족 발생',
            placement: 'topRight',
            duration: 6,
            onClick: () => navigate('/common/notifications'),
            style: { cursor: 'pointer' },
          });
        }
      } else {
        resolveSoShortage(event.salesOrderId);
        if (isInitialized && wasAlreadyKnown) {
          notification.success({
            message: `🟢 출고 가능: ${event.soNo}`,
            description: `${event.storeName} — 재고 부족 해소`,
            placement: 'topRight',
            duration: 4,
            onClick: () => navigate('/common/notifications'),
            style: { cursor: 'pointer' },
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      return;
    }
    if (isLowStockEvent(event)) {
      // 재고 부족 알림 — Redis diff 방식 (백엔드에서 added/resolved 변동분만 push, 스팸 차단).
      // 토스트 suppress 정책은 SO 부족과 동일:
      //  1. baseline 도착 전(isInitialized=false): WS added 가 와도 토스트 X, store 만 누적
      //  2. baseline 후라도 store 에 이미 같은 (product × warehouse) 가 있으면 토스트 skip
      const lsState = useLowStockStore.getState();
      const lsKey = `${event.productId}:${event.warehouseId}`;
      const wasAlreadyKnown = lsState.shortages.has(lsKey);
      const isInitialized = lsState.isInitialized;
      const wh = event.warehouseName ?? '-';

      if (event.type === 'low_stock_added') {
        addLowStock(event);
        if (isInitialized && !wasAlreadyKnown) {
          notification.warning({
            message: `🔴 [${event.productName} / ${wh}] 재고 부족`,
            description: `현재 ${event.availableQty} / 안전재고 ${event.minStockQty}`,
            placement: 'topRight',
            duration: 6,
            onClick: () => navigate('/common/notifications'),
            style: { cursor: 'pointer' },
          });
        }
      } else {
        resolveLowStock(event.productId, event.warehouseId);
        if (isInitialized && wasAlreadyKnown) {
          notification.success({
            message: `🟢 [${event.productName} / ${wh}] 재고 부족 해소`,
            placement: 'topRight',
            duration: 4,
            onClick: () => navigate('/common/notifications'),
            style: { cursor: 'pointer' },
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      return;
    }
  });
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const breadcrumbItems = useBreadcrumbItems(location.pathname);
  /** 레이아웃 편집기: 남는 뷰포트를 캔버스에 넘기기 위해 flex + overflow 제한 */
  const isWarehouseLayoutEditor = location.pathname.includes('/warehouse/layout-editor');

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key);
  };

  // 현재 경로에서 열린 서브메뉴 키 추출
  const openKeys = location.pathname === '/'
    ? []
    : [location.pathname.split('/').filter(Boolean)[0]];

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '내 프로필',
      onClick: () => navigate('/my/profile'),
    },
    {
      key: 'password',
      icon: <LockOutlined />,
      label: '비밀번호 변경',
      onClick: () => navigate('/my/password'),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '로그아웃',
      onClick: () => {
        // 다른 회사 계정으로 재로그인 시 옛 데이터(warehouses 등) 잔존 차단
        queryClient.clear();
        logout();
        navigate('/login');
      },
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'row' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={240}
        trigger={null}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div
          style={{
            height: 48,
            margin: 12,
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: collapsed ? 14 : 20,
            lineHeight: '48px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {collapsed ? 'WMS' : '(주) WMS System'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={openKeys}
          items={siderMenuItems}
          onClick={onMenuClick}
        />
      </Sider>
      <Layout
        style={{
          marginLeft: collapsed ? 80 : 240,
          transition: 'margin-left 0.2s',
          background: 'transparent',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          /* 우측 "내 활동" 과 나란히 둘 때 남는 폭만 차지하고, min-width:auto 로 인한 압축 깨짐 방지 */
          flex: '1 1 0%',
          minWidth: 0,
          ...(isWarehouseLayoutEditor ? { minHeight: 0 } : {}),
        }}
      >
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Space size="middle">
            <SessionTimer />
            <NotificationBellPopover count={notificationCount} />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <UserOutlined />
                <span>{user?.name ?? 'Admin'}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content
          className={isWarehouseLayoutEditor ? 'warehouse-layout-editor-shell-main' : undefined}
          style={{
            margin: isWarehouseLayoutEditor ? '8px 8px 0' : 16,
            background: 'transparent',
            ...(isWarehouseLayoutEditor
              ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
              : {}),
          }}
        >
          <Breadcrumb
            items={breadcrumbItems}
            style={{ marginBottom: isWarehouseLayoutEditor ? 6 : 16, flexShrink: 0 }}
          />
          <div
            className={isWarehouseLayoutEditor ? 'warehouse-layout-editor-shell-outlet' : undefined}
            style={{
              padding: isWarehouseLayoutEditor ? '0 12px 8px' : 24,
              background: 'transparent',
              ...(isWarehouseLayoutEditor
                ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
                : { minHeight: 360 }),
            }}
          >
            <Outlet />
          </div>
        </Content>
      </Layout>

      {/* 우측 "내 활동" 사이드바 — 로그인 사용자의 감사 로그 라이브 표시 */}
      {isLoggedIn && (
        <MyActivitySider collapsed={activityCollapsed} onToggle={toggleActivitySider} />
      )}

      {/* 전역 AI 챗봇 — 모든 페이지에서 우하단에 떠 있음 */}
      <FloatingChatbot />
    </Layout>
  );
}
