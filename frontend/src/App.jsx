import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';

// Eagerly loaded pages
import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// Layouts
import AppLayout from './components/layout/AppLayout';
import BareLayout from './components/layout/BareLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Lazy-loaded pages — faster initial load
const MasterDashboard      = lazy(() => import('./pages/master/MasterDashboard'));
const FranchisesPage       = lazy(() => import('./pages/master/FranchisesPage'));
const MasterMenuPage       = lazy(() => import('./pages/master/MasterMenuPage'));
const MasterStaffPage      = lazy(() => import('./pages/master/MasterStaffPage'));
const MasterCustomersPage  = lazy(() => import('./pages/master/MasterCustomersPage'));
const MasterInvoicesPage   = lazy(() => import('./pages/master/MasterInvoicesPage'));
const CouponsPage          = lazy(() => import('./pages/master/CouponsPage'));
const AuditLogPage         = lazy(() => import('./pages/master/AuditLogPage'));
const UnifiedReportPage    = lazy(() => import('./pages/shared/UnifiedReportPage'));
const FastMovingItemsPage  = lazy(() => import('./pages/shared/FastMovingItemsPage'));
const GlobalSearchPage     = lazy(() => import('./pages/shared/GlobalSearchPage'));
const InventoryPage        = lazy(() => import('./pages/shared/InventoryPage'));
const FranchiseDashboard   = lazy(() => import('./pages/franchise/FranchiseDashboard'));
const FranchiseMenuPage    = lazy(() => import('./pages/franchise/FranchiseMenuPage'));
const FranchiseStaffPage   = lazy(() => import('./pages/franchise/FranchiseStaffPage'));
const FranchiseOrdersPage  = lazy(() => import('./pages/franchise/FranchiseOrdersPage'));
const POSScreen            = lazy(() => import('./pages/pos/POSScreen'));
const TableMapPage         = lazy(() => import('./pages/pos/TableMapPage'));
const KitchenScreen        = lazy(() => import('./pages/kitchen/KitchenScreen'));
const WaiterDashboard      = lazy(() => import('./pages/waiter/WaiterDashboard'));
const RawMaterialsPage     = lazy(() => import('./pages/shared/RawMaterialsPage'));
const TokenDisplayBoard    = lazy(() => import('./pages/display/TokenDisplayBoard'));
const CustomerMenuPage     = lazy(() => import('./pages/public/CustomerMenuPage'));

const ROLE_HOME = {
  master_admin:    '/master/dashboard',
  franchise_owner: '/franchise/dashboard',
  manager:         '/franchise/dashboard',
  pos_staff:       '/pos',
  shift_operator:  '/pos',
  kitchen_staff:   '/kitchen',
  waiter:          '/waiter',
};

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function InitializingScreen() {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-600 text-sm">Loading UTC Café...</p>
    </div>
  );
}

export default function App() {
  const { fetchMe, user, initializing } = useAuthStore();

  useEffect(() => { fetchMe(); }, []);

  if (initializing) return <InitializingScreen />;

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1a1a1a', color: '#fff', border: '1px solid #2d2d2d' },
          success: { iconTheme: { primary: '#f97316', secondary: '#fff' } },
        }}
      />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={
            user ? <Navigate to={ROLE_HOME[user.role] || '/'} replace /> : <LoginPage />
          } />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />

          {/* Public token display board — no auth required (for TV screens) */}
          <Route path="/display/:franchiseId" element={<TokenDisplayBoard />} />

          {/* Public customer menu — QR scan landing page */}
          <Route path="/menu/:franchiseId" element={<CustomerMenuPage />} />

          {/* Root redirect */}
          <Route path="/" element={
            user ? <Navigate to={ROLE_HOME[user.role]} replace /> : <Navigate to="/login" replace />
          } />

          {/* ── Master Admin ─────────────────────────────────── */}
          <Route path="/master" element={
            <ProtectedRoute roles={['master_admin']}><AppLayout /></ProtectedRoute>
          }>
            <Route path="dashboard"       element={<MasterDashboard />} />
            <Route path="franchises"      element={<FranchisesPage />} />
            <Route path="menu"            element={<MasterMenuPage />} />
            <Route path="customers"       element={<MasterCustomersPage />} />
            <Route path="invoices"        element={<MasterInvoicesPage />} />
            <Route path="coupons"         element={<CouponsPage />} />
            <Route path="audit"           element={<AuditLogPage />} />
            <Route path="reports"         element={<UnifiedReportPage />} />
            <Route path="fast-moving"     element={<FastMovingItemsPage />} />
            <Route path="search"          element={<GlobalSearchPage />} />
            <Route path="inventory"       element={<InventoryPage />} />
          </Route>

          {/* ── Franchise Owner / Manager ─────────────────────── */}
          <Route path="/franchise" element={
            <ProtectedRoute roles={['franchise_owner', 'manager']}><AppLayout /></ProtectedRoute>
          }>
            <Route path="dashboard"       element={<FranchiseDashboard />} />
            <Route path="menu"            element={<FranchiseMenuPage />} />
            <Route path="staff"           element={<FranchiseStaffPage />} />
            <Route path="orders"          element={<FranchiseOrdersPage />} />
            <Route path="invoices"        element={<MasterInvoicesPage />} />
            <Route path="tables"          element={<TableMapPage />} />
            <Route path="reports"         element={<UnifiedReportPage />} />
            <Route path="fast-moving"     element={<FastMovingItemsPage />} />
            <Route path="search"          element={<GlobalSearchPage />} />
            <Route path="inventory"       element={<InventoryPage />} />
          </Route>

          {/* ── POS — BareLayout (POSScreen has its own sidebar) ── */}
          <Route path="/pos" element={
            <ProtectedRoute roles={['pos_staff', 'shift_operator', 'manager', 'franchise_owner']}>
              <BareLayout />
            </ProtectedRoute>
          }>
            <Route index          element={<POSScreen mode="billing" />} />
            <Route path="history" element={<POSScreen mode="history" />} />
            <Route path="tables"  element={<TableMapPage />} />
          </Route>

          {/* ── Kitchen ──────────────────────────────────────── */}
          <Route path="/kitchen" element={
            <ProtectedRoute roles={['kitchen_staff', 'manager', 'franchise_owner']}>
              <KitchenScreen />
            </ProtectedRoute>
          } />

          {/* ── Inventory (shared across roles) ─────────────── */}
          <Route path="/inventory/raw-materials" element={
            <ProtectedRoute roles={['master_admin','franchise_owner','manager','kitchen_staff','pos_staff','shift_operator']}>
              <AppLayout />
            </ProtectedRoute>
          }>
            <Route index element={<RawMaterialsPage />} />
          </Route>

          {/* ── Waiter — BareLayout (WaiterDashboard has its own sidebar) ── */}
          <Route path="/waiter" element={
            <ProtectedRoute roles={['waiter']}>
              <BareLayout />
            </ProtectedRoute>
          }>
            <Route index element={<WaiterDashboard />} />
          </Route>

          {/* ── Waiter Inventory — AppLayout (content page, needs sidebar) ── */}
          <Route path="/waiter/inventory" element={
            <ProtectedRoute roles={['waiter']}>
              <AppLayout />
            </ProtectedRoute>
          }>
            <Route index element={<RawMaterialsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
