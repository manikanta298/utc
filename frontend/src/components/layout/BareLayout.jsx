import { Outlet } from 'react-router-dom';
import NotificationProvider from '../NotificationProvider';

/**
 * BareLayout — no sidebar, no header.
 * Used for pages with their own full built-in layout (POS, Waiter).
 * NotificationProvider is included here so order:ready / order:new
 * socket listeners are active even on BareLayout routes.
 */
export default function BareLayout() {
  return (
    <>
      <NotificationProvider />
      <Outlet />
    </>
  );
}
