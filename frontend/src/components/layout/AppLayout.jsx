import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Coffee, LayoutDashboard, Store, UtensilsCrossed, Users, Receipt,
  FileText, ChefHat, LogOut, Menu, X, History, Lock, Tag,
  Shield, BarChart2, MapPin, IndianRupee, TrendingUp, Search, Package,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { normalizeRole } from '../../utils/roles';
import { disconnectSocket } from '../../lib/socket';
import NotificationProvider from '../NotificationProvider';

const MASTER_NAV = [
  { to: '/master/dashboard',       icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/master/franchises',      icon: Store,           label: 'Franchises' },
  { to: '/master/menu',            icon: UtensilsCrossed, label: 'Menu' },
  { to: '/master/customers',       icon: Users,           label: 'Customers' },
  { to: '/master/invoices',        icon: FileText,        label: 'Invoices & GST' },
  { to: '/master/coupons',         icon: Tag,             label: 'Coupons' },
  { to: '/master/reports',         icon: FileText,        label: 'Reports' },
  { to: '/master/audit',           icon: Shield,          label: 'Audit Logs' },
  { to: '/master/fast-moving',     icon: TrendingUp,      label: 'Fast Moving Items' },
  { to: '/master/search',          icon: Search,          label: 'Search' },
  { to: '/master/inventory',       icon: Package,         label: 'Inventory' },
];

const FRANCHISE_NAV = [
  { to: '/franchise/dashboard',       icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/franchise/orders',          icon: Receipt,         label: 'Orders' },
  { to: '/franchise/menu',            icon: UtensilsCrossed, label: 'Menu' },
  { to: '/franchise/staff',           icon: Users,           label: 'Staff' },
  { to: '/franchise/tables',          icon: MapPin,          label: 'Table Map' },
  { to: '/franchise/reports',         icon: FileText,        label: 'Reports' },
  { to: '/franchise/fast-moving',     icon: BarChart2,       label: 'Fast Moving Items' },
  { to: '/franchise/search',          icon: Search,          label: 'Search' },
  { to: '/franchise/inventory',       icon: Package,         label: 'Inventory' },
  { to: '/inventory/raw-materials',     icon: Package,         label: 'Raw Materials' },
  { to: '/pos',                       icon: Receipt,         label: 'POS Billing', matchPaths: ['/pos', '/pos/history'] },
  { to: '/kitchen',                   icon: ChefHat,         label: 'Kitchen' },
];

const POS_NAV = [
  { to: '/pos',          icon: Receipt, label: 'POS Billing' },
  { to: '/pos/history',  icon: History, label: 'Order History' },
  { to: '/pos/tables',   icon: MapPin,  label: 'Table Map' },
  { to: '/inventory/raw-materials', icon: Package, label: 'Stock' },
];

const KITCHEN_NAV = [
  { to: '/kitchen', icon: ChefHat, label: 'Kitchen' },
  { to: '/inventory/raw-materials', icon: Package, label: 'Stock Update' },
];

const WAITER_NAV = [
  { to: '/waiter', icon: UtensilsCrossed, label: 'My Orders' },
  { to: '/inventory/raw-materials', icon: Package, label: 'Stock Update' },
];

const ROLE_LABELS = {
  master_admin:    'Master Admin',
  franchise_owner: 'Franchise Owner',
  manager:         'Manager',
  pos_staff:       'POS Staff',
  shift_operator:  'Shift Operator',
  kitchen_staff:   'Kitchen Staff',
  waiter:          'Waiter',
};

const getNavForRole = (role) => {
  switch (role) {
    case 'master_admin':   return MASTER_NAV;
    case 'franchise_owner':
    case 'manager':        return FRANCHISE_NAV;
    case 'pos_staff':
    case 'pos_shift_operator':
    case 'shift_operator': return POS_NAV;
    case 'kitchen_staff':  return KITCHEN_NAV;
    case 'waiter':         return WAITER_NAV;
    default:               return [];
  }
};

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);

  const nav = useMemo(() => getNavForRole(normalizeRole(user?.role)), [user?.role]);
  const franchiseStatus = user?.franchise_id?.status || (user?.franchise_id?.isActive === false ? 'inactive' : 'active');

  // Notification socket listeners now live in <NotificationProvider />,
  // rendered below in the JSX. This component is included in BOTH AppLayout
  // and BareLayout so POS/Waiter/Kitchen routes (which use BareLayout) also
  // receive order:ready / order:new notifications.

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  const handleLogout = async () => {
    disconnectSocket();
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  return (
    <div className="flex min-h-screen bg-dark-900">
      <NotificationProvider />
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-dark-600 bg-dark-800',
          'transition-transform duration-300 ease-in-out',
          'lg:static lg:z-auto lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="flex items-center justify-between gap-3 border-b border-dark-600 px-4 py-4">
          <div className="flex flex-1 items-center justify-center">
            <img
                src="/logo.png"
                alt="UTC Cafe"
                style={{
                  height: '80px',
                  width: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-dark-700 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
          {nav.map(({ to, icon: Icon, label, matchPaths }) => {
            const isActive = matchPaths
              ? matchPaths.some((p) => location.pathname === p)
              : location.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                className={[
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'border border-brand-500/20 bg-brand-500/15 text-brand-400'
                    : 'text-gray-500 hover:bg-dark-600 hover:text-white',
                ].join(' ')}
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User card + logout */}
        <div className="border-t border-dark-600 p-3">
          <div className="mb-2 rounded-xl bg-dark-700 p-3">
            <div className="truncate text-sm font-semibold text-white">{user?.name}</div>
            <div className="truncate text-xs text-gray-500">{user?.email}</div>
            <div className="mt-1">
              <span className="badge border border-brand-500/20 bg-brand-500/15 text-brand-400">
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-500 transition-all hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut size={18} className="flex-shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center gap-4 border-b border-dark-600 bg-dark-800 px-4 sm:px-6 flex-shrink-0">
          <button
            onClick={toggleSidebar}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-dark-700 hover:text-white flex-shrink-0"
            aria-label="Toggle navigation"
            type="button"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">
              {ROLE_LABELS[user?.role] || 'Workspace'}
            </div>
          </div>

          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-sm font-bold text-brand-400 flex-shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {/* FIX: Franchise inactive warning banner */}
          {franchiseStatus !== 'active' && user?.role !== 'master_admin' && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-bold">Franchise is {franchiseStatus} — all operations are blocked (403 errors)</p>
                <p className="text-xs text-red-300 mt-0.5">Ask your <strong>master admin</strong> to log in → go to <strong>Franchises</strong> page → click <strong>"Activate"</strong> on this franchise.</p>
              </div>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
