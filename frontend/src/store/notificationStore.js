import { create } from 'zustand';

export const NOTIF_LABELS = {
  ready:     { emoji: '🍽️', text: 'Order Ready!',    color: 'green' },
  new_order: { emoji: '🆕', text: 'New Order!',       color: 'orange' },
  approved:  { emoji: '✅', text: 'Order Approved!',  color: 'blue' },
};

const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notif) => {
    const id = Date.now();
    const item = { id, accepted: false, ...notif };
    set((s) => ({
      notifications: [item, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    }));
    // auto-clear after 12 hours
    setTimeout(() => get().removeNotification(id), 12 * 60 * 60 * 1000);
  },

  markAccepted: (id, acceptedBy) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id
          ? { ...n, accepted: true, acceptedBy, acceptedAt: new Date().toISOString() }
          : n
      ),
    })),

  markRead: () => set({ unreadCount: 0 }),

  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
      unreadCount: s.notifications.some((n) => n.id === id)
        ? Math.max(0, s.unreadCount - 1)
        : s.unreadCount,
    })),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}));

export default useNotificationStore;
