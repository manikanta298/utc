import { Navigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { normalizeRole } from '../../utils/roles';

const ROLE_HOME = {
  master_admin:    '/master/dashboard',
  franchise_owner: '/franchise/dashboard',
  manager:         '/franchise/dashboard',
  pos_staff:       '/pos',
  pos_shift_operator: '/pos',
  shift_operator:  '/pos',
  kitchen_staff:   '/kitchen',
  waiter:          '/waiter',   // FIX: was missing
};

export default function ProtectedRoute({ children, roles = [], allowedRoles = [] }) {
  const { user, token, initializing } = useAuthStore();
  const acceptedRoles = (allowedRoles.length ? allowedRoles : roles).map(normalizeRole);

  if (initializing) return null;

  if (!token) return <Navigate to="/login" replace />;

  if (!user) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentRole = normalizeRole(user.role);
  if (acceptedRoles.length && !acceptedRoles.includes(currentRole)) {
    return <Navigate to="/unauthorized" replace state={{ from: ROLE_HOME[currentRole] || '/' }} />;
  }

  return children;
}
