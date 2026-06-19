/**
 * NotificationProvider — mounted inside EVERY authenticated layout
 * (AppLayout AND BareLayout). This ensures socket notification listeners
 * run regardless of which layout the route uses.
 *
 * Handles:
 *   order:ready  → audio + voice + toast + notificationStore
 *   order:new    → audio + toast + notificationStore
 */
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useNotificationStore from '../store/notificationStore';
import { getSocket, joinFranchiseRoom, joinPOSRoom, joinWaiterRoom } from '../lib/socket';
import { playOrderReadySound, playNewOrderSound, announceReady } from '../lib/audioNotify';
import { normalizeRole } from '../utils/roles';

export default function NotificationProvider() {
  const { user } = useAuthStore();
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    const fid = (user?.franchise_id?._id || user?.franchise_id)?.toString();
    if (!fid || !user?.role) return;

    const role = normalizeRole(user.role);
    if (role === 'pos_staff' || role === 'shift_operator') {
      joinPOSRoom(fid);
    } else if (role === 'waiter') {
      joinWaiterRoom(fid);
    } else {
      joinFranchiseRoom(fid);
    }

    const socket = getSocket();
    if (!socket) return;

    const handleOrderReady = (data) => {
      playOrderReadySound();
      if (data?.tokenNumber) {
        announceReady({ tokenNumber: data.tokenNumber, tableNumber: data.tableNumber });
      }
      toast.success(
        `🔔 Order Ready! Token #${data?.tokenNumber || '—'} · Table ${data?.tableNumber || 'Counter'}`,
        { duration: 8000, id: `ready-${data?.orderId || Date.now()}` }
      );
      addNotification({
        type:         'ready',
        orderId:      data?.orderId,
        tokenNumber:  data?.tokenNumber,
        tableNumber:  data?.tableNumber,
        customerName: data?.customerName,
        orderType:    data?.orderType,
      });
    };

    const handleNewOrder = (data) => {
      playNewOrderSound();
      addNotification({
        type:         'new_order',
        orderId:      data?._id || data?.orderId,
        tokenNumber:  data?.token_number || data?.tokenNumber,
        tableNumber:  data?.table_number || data?.tableNumber,
        customerName: data?.customer_id?.name || data?.customerName,
        orderType:    data?.order_type || data?.orderType,
      });
    };

    socket.on('order:ready', handleOrderReady);
    socket.on('order:new',   handleNewOrder);

    return () => {
      socket.off('order:ready', handleOrderReady);
      socket.off('order:new',   handleNewOrder);
    };
  }, [user?._id, addNotification]);

  return null; // renders nothing, just sets up listeners
}
