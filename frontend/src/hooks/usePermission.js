import useAuthStore from '../store/authStore';
import { hasPermission } from '../utils/roles';

export default function usePermission(moduleName) {
  const user = useAuthStore((state) => state.user);
  return hasPermission(user?.role, moduleName);
}
