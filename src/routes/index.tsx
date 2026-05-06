import { Navigate, useParams } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import PermissionGuard from '@/components/PermissionGuard';
import AdminOnlyRoute from '@/components/AdminOnlyRoute';
import RoleBasedIndex from '@/components/RoleBasedIndex';
import LoginPage from '@/pages/auth/LoginPage';

function G({ r, children }: { r: string; children: React.ReactNode }) {
  return <PermissionGuard resource={r}>{children}</PermissionGuard>;
}

// 마스터 관리
import SupplierPage from '@/pages/master/SupplierPage';
import StorePage from '@/pages/master/StorePage';
import ProductPage from '@/pages/master/ProductPage';
import ProductGroupPage from '@/pages/master/ProductGroupPage';
import ProductCategoryPage from '@/pages/master/ProductCategoryPage';
import SafetyStockPage from '@/pages/master/SafetyStockPage';
import OptionTypePage from '@/pages/master/OptionTypePage';
import OptionValuePage from '@/pages/master/OptionValuePage';

// 창고 관리
import WarehouseListPage from '@/pages/warehouse/WarehouseListPage';
import WarehouseDetailPage from '@/pages/warehouse/WarehouseDetailPage';
import WarehouseLayoutEditorHubPage from '@/pages/warehouse/WarehouseLayoutEditorHubPage';
import WarehouseMonitoringPage from '@/pages/warehouse/WarehouseMonitoringPage';
import RackLabelPrintPage from '@/pages/warehouse/RackLabelPrintPage';

// 주문 관리
import InboundListPage from '@/pages/order/InboundListPage';
import ReturnInboundPage from '@/pages/order/ReturnInboundPage';
import ReturnOutboundPage from '@/pages/order/ReturnOutboundPage';
import ReturnInboundListPage from '@/pages/order/ReturnInboundListPage';
import ReturnOutboundListPage from '@/pages/order/ReturnOutboundListPage';
import InboundDetailPage from '@/pages/order/InboundDetailPage';
import InboundPlacementPage from '@/pages/order/InboundPlacementPage';
import PlacementListPage from '@/pages/order/PlacementListPage';
import EtcInOutPage from '@/pages/order/EtcInOutPage';
import EtcInOutDetailPage from '@/pages/order/EtcInOutDetailPage';
import OutboundListPage from '@/pages/order/OutboundListPage';
import OutboundDetailPage from '@/pages/order/OutboundDetailPage';
import CreateOutboundFromSalesOrdersPage from '@/pages/order/CreateOutboundFromSalesOrdersPage';
import CreateInboundFromPurchaseOrdersPage from '@/pages/order/CreateInboundFromPurchaseOrdersPage';
import InboundReceiptListPage from '@/pages/order/InboundReceiptListPage';
import OutboundDispatchListPage from '@/pages/order/OutboundDispatchListPage';
import SoShortagePage from '@/pages/order/SoShortagePage';
import SalesOrderProgressPage from '@/pages/order/SalesOrderProgressPage';
import PickingListPage from '@/pages/order/PickingListPage';
import PickingDetailPage from '@/pages/order/PickingDetailPage';
import IntegratedOrdersPage from '@/pages/order/IntegratedOrdersPage';
import TransferListPage from '@/pages/order/TransferListPage';
import TransferDetailPage from '@/pages/order/TransferDetailPage';
import IncompleteOrderPage from '@/pages/order/IncompleteOrderPage';

// 재고 관리
import StockStatusPage from '@/pages/inventory/StockStatusPage';
import StockAuditPage from '@/pages/inventory/StockAuditPage';
import StockCountDetailPage from '@/pages/inventory/StockCountDetailPage';

// 통계
import InOutStatusPage from '@/pages/statistics/InOutStatusPage';
import TurnoverPage from '@/pages/statistics/TurnoverPage';
import RankingPage from '@/pages/statistics/RankingPage';
import LowStockAlertPage from '@/pages/common/LowStockAlertPage';

// 공통 관리
import NotificationPage from '@/pages/common/NotificationPage';
import AuditLogPage from '@/pages/common/AuditLogPage';
import BatchManagementPage from '@/pages/common/BatchManagementPage';

// 설정
import UserManagementPage from '@/pages/settings/UserManagementPage';
import PermissionManagementPage from '@/pages/settings/PermissionManagementPage';

// 개발자
import DeveloperClientListPage from '@/pages/developer/DeveloperClientListPage';
import DeveloperClientCreatePage from '@/pages/developer/DeveloperClientCreatePage';

// 지시서 문서함
import InstructionDocumentList from '@/pages/instruction-documents/InstructionDocumentList';

// 문서/증빙 관리
import OfficialDocumentsPage from '@/pages/documents/OfficialDocumentsPage';
import EvidenceDocumentsPage from '@/pages/documents/EvidenceDocumentsPage';

// 내 계정
import MyProfilePage from '@/pages/my/MyProfilePage';
import ChangePasswordPage from '@/pages/my/ChangePasswordPage';

function WarehouseLayoutRedirectById() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/warehouse/layout-editor?wh=${id ?? ''}&tab=zone`} replace />;
}

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      // 루트: 역할에 따라 분기 (DEVELOPER → 회사 목록, 그 외 → 대시보드)
      { index: true, element: <RoleBasedIndex /> },

      // 마스터 관리
      { path: 'master/suppliers', element: <G r="MASTER"><SupplierPage /></G> },
      { path: 'master/stores', element: <G r="MASTER"><StorePage /></G> },
      { path: 'master/products', element: <G r="MASTER"><ProductPage /></G> },
      { path: 'master/product-groups', element: <G r="MASTER"><ProductGroupPage /></G> },
      { path: 'master/product-categories', element: <G r="MASTER"><ProductCategoryPage /></G> },
      { path: 'master/safety-stocks', element: <G r="MASTER"><SafetyStockPage /></G> },
      { path: 'master/option-types', element: <AdminOnlyRoute><OptionTypePage /></AdminOnlyRoute> },
      { path: 'master/option-types/:typeId/values', element: <AdminOnlyRoute><OptionValuePage /></AdminOnlyRoute> },

      // 창고 관리
      { path: 'warehouse/list', element: <G r="MASTER"><WarehouseListPage /></G> },
      { path: 'warehouse/layout-editor', element: <G r="MASTER"><WarehouseLayoutEditorHubPage /></G> },
      { path: 'warehouse/:id/layout', element: <G r="MASTER"><WarehouseLayoutRedirectById /></G> },
      // 창고 모니터링 (운영 조회)
      { path: 'warehouse/monitoring', element: <G r="INVENTORY"><WarehouseMonitoringPage /></G> },
      { path: 'warehouse/monitor', element: <Navigate to="/warehouse/monitoring" replace /> },
      { path: 'warehouse/zone-layout', element: <Navigate to="/warehouse/layout-editor?tab=rack" replace /> },
      { path: 'warehouse/:id', element: <G r="MASTER"><WarehouseDetailPage /></G> },
      // 기존 경로 리다이렉트
      { path: 'warehouse/zones', element: <Navigate to="/warehouse/list" replace /> },
      { path: 'warehouse/racks', element: <Navigate to="/warehouse/list" replace /> },
      { path: 'warehouse/warehouse-layout', element: <Navigate to="/warehouse/list" replace /> },
      { path: 'warehouse/rack-layout', element: <Navigate to="/warehouse/list" replace /> },
      { path: 'warehouse/rack-qr', element: <Navigate to="/warehouse/rack-labels" replace /> },
      { path: 'warehouse/rack-labels', element: <G r="MASTER"><RackLabelPrintPage /></G> },

      // 주문 관리
      { path: 'order/inbound', element: <G r="INBOUND"><InboundListPage /></G> },
      { path: 'order/inbound/new', element: <G r="INBOUND"><CreateInboundFromPurchaseOrdersPage /></G> },
      { path: 'order/inbound/receipts', element: <G r="INBOUND"><InboundReceiptListPage /></G> },
      { path: 'order/inbound/placements', element: <G r="INBOUND"><PlacementListPage /></G> },
      { path: 'order/inbound/:id', element: <G r="INBOUND"><InboundDetailPage /></G> },
      { path: 'order/inbound/:id/placement', element: <G r="INBOUND"><InboundPlacementPage /></G> },
      { path: 'order/return-inbound', element: <G r="INBOUND"><ReturnInboundPage /></G> },
      { path: 'order/return-inbound/list', element: <G r="INBOUND"><ReturnInboundListPage /></G> },
      { path: 'order/return-outbound', element: <G r="OUTBOUND"><ReturnOutboundPage /></G> },
      { path: 'order/return-outbound/list', element: <G r="OUTBOUND"><ReturnOutboundListPage /></G> },
      { path: 'order/etc-inout', element: <Navigate to="/etc-inout/in" replace /> },
      { path: 'order/outbound', element: <G r="OUTBOUND"><OutboundListPage /></G> },
      { path: 'order/outbound/new', element: <G r="OUTBOUND"><CreateOutboundFromSalesOrdersPage /></G> },
      { path: 'order/outbound/dispatches', element: <G r="OUTBOUND"><OutboundDispatchListPage /></G> },
      { path: 'order/outbound/:id', element: <G r="OUTBOUND"><OutboundDetailPage /></G> },
      { path: 'order/sales-orders/shortage', element: <G r="OUTBOUND"><SoShortagePage /></G> },
      { path: 'order/sales-orders/:id/progress', element: <G r="OUTBOUND"><SalesOrderProgressPage /></G> },
      { path: 'order/picking', element: <G r="OUTBOUND"><PickingListPage /></G> },
      { path: 'order/picking/:id', element: <G r="OUTBOUND"><PickingDetailPage /></G> },
      { path: 'order/transfer', element: <G r="TRANSFER"><TransferListPage /></G> },
      { path: 'order/transfer/:id', element: <G r="TRANSFER"><TransferDetailPage /></G> },
      { path: 'order/incomplete', element: <IncompleteOrderPage /> },
      { path: 'orders/integrated', element: <IntegratedOrdersPage /> },

      // 기타 입출고 운영 — 입고/출고 그룹별 메뉴에서 진입 (둘 다 동일 페이지)
      { path: 'etc-inout', element: <Navigate to="/etc-inout/in" replace /> },
      { path: 'etc-inout/in', element: <G r="ETC_INOUT"><EtcInOutPage /></G> },
      { path: 'etc-inout/out', element: <G r="ETC_INOUT"><EtcInOutPage /></G> },
      { path: 'etc-inout/in/:id', element: <G r="ETC_INOUT"><EtcInOutDetailPage /></G> },
      { path: 'etc-inout/out/:id', element: <G r="ETC_INOUT"><EtcInOutDetailPage /></G> },

      // 지시서 문서함 (PDF 발행 이력) — 백엔드가 X-Client-Id 기반으로 권한 격리
      { path: 'instruction-documents', element: <InstructionDocumentList /> },

      // 문서/증빙 관리
      { path: 'documents/official', element: <OfficialDocumentsPage /> },
      { path: 'documents/evidence', element: <EvidenceDocumentsPage /> },

      // 재고 관리
      { path: 'inventory/stocks', element: <G r="INVENTORY"><StockStatusPage /></G> },
      { path: 'inventory/stock-count', element: <G r="STOCK_COUNT"><StockAuditPage /></G> },
      { path: 'inventory/stock-count/:id', element: <G r="STOCK_COUNT"><StockCountDetailPage /></G> },

      // 통계
      { path: 'statistics/inout', element: <G r="STATISTICS"><InOutStatusPage /></G> },
      { path: 'statistics/turnover', element: <G r="STATISTICS"><TurnoverPage /></G> },
      { path: 'statistics/ranking', element: <G r="STATISTICS"><RankingPage /></G> },
      // 수용량 분석은 /warehouse/monitoring?tab=capacity 로 이동됨

      // 공통 관리
      { path: 'common/notifications', element: <NotificationPage /> },
      { path: 'common/low-stock', element: <G r="INVENTORY"><LowStockAlertPage /></G> },
      { path: 'common/audit-logs', element: <AuditLogPage /> },
      { path: 'common/batch', element: <BatchManagementPage /> },

      // 설정
      { path: 'settings/users', element: <UserManagementPage /> },
      { path: 'settings/roles', element: <PermissionManagementPage /> },
      { path: 'admin/permissions', element: <Navigate to="/settings/roles" replace /> },

      // 개발자 전용
      { path: 'developer', element: <Navigate to="/developer/clients" replace /> },
      { path: 'developer/clients', element: <DeveloperClientListPage /> },
      { path: 'developer/clients/new', element: <DeveloperClientCreatePage /> },

      // 내 계정 (모든 인증 사용자)
      { path: 'my/profile', element: <MyProfilePage /> },
      { path: 'my/password', element: <ChangePasswordPage /> },
    ],
  },
];
