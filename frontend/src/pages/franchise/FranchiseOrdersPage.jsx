import { useEffect, useState, useCallback } from 'react';
import { Download, Printer, RefreshCw, Pencil, X, Save, Shield } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { format } from 'date-fns';
import EditPinModal from '../../components/pos/EditPinModal';
import toast from 'react-hot-toast';
import { getSocket, joinFranchiseRoom } from '../../lib/socket';

const STATUS_FILTERS = ['', 'Pending', 'Accepted', 'Preparing', 'Ready', 'Delivered'];
const PAYMENT_MODES  = ['Cash', 'UPI', 'Card', 'Net Banking'];

export default function FranchiseOrdersPage() {
  const { user } = useAuthStore();
  const isMaster = user?.role === 'master_admin';
  const franchiseId = user?.franchise_id?._id || user?.franchise_id;

  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal]     = useState(0);
  const [filters, setFilters] = useState({ status: '', date: '', page: 1 });

  // PIN flow
  const [pinTarget, setPinTarget]     = useState(null); // order to edit after PIN
  const [showPin, setShowPin]         = useState(false);
  const [pinVerified, setPinVerified] = useState(false);

  // Edit modal
  const [editOrder, setEditOrder]   = useState(null);
  const [editForm, setEditForm]     = useState({});
  const [saving, setSaving]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: 30, ...filters });
    const res = await api.get(`/orders?${params}`);
    setOrders(res.data.orders);
    setTotal(res.data.total);
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Real-time: subscribe to order events for live updates
  useEffect(() => {
    const fid = (franchiseId?._id || franchiseId)?.toString();
    if (!fid) return;
    joinFranchiseRoom(fid);
    const socket = getSocket();

    // When status changes, update that specific order in-place (no full reload)
    const handleStatusUpdate = ({ orderId, kitchen_status, status }) => {
      setOrders((prev) => prev.map((o) =>
        o._id === orderId ? { ...o, kitchen_status: kitchen_status || o.kitchen_status, status: status || o.status } : o
      ));
    };
    // New order from customer scan or POS — prepend to list
    const handleNewOrder = (order) => {
      if (filters.status === '' || filters.status === 'Pending') {
        setOrders((prev) => [order, ...prev.slice(0, 29)]);
        setTotal((t) => t + 1);
        toast('New order arrived', { icon: '🛎️', duration: 3000 });
      }
    };

    socket.on('order:statusUpdate',   handleStatusUpdate);
    socket.on('order:statusUpdated',  handleStatusUpdate);
    socket.on('order:new',            handleNewOrder);
    socket.on('session:closed',       load); // refresh after payment
    return () => {
      socket.off('order:statusUpdate',  handleStatusUpdate);
      socket.off('order:statusUpdated', handleStatusUpdate);
      socket.off('order:new',           handleNewOrder);
      socket.off('session:closed',      load);
    };
  }, [franchiseId, filters.status, load]);

  const downloadBlob = (data, type, filename) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    URL.revokeObjectURL(url);
  };
  const downloadReport = async () => {
    const params = new URLSearchParams({ ...filters });
    const res = await api.get(`/orders/export.csv?${params}`, { responseType: 'blob' });
    downloadBlob(res.data, 'text/csv', 'orders-report.csv');
  };
  const openReceipt = async (orderId) => {
    const res = await api.get(`/orders/${orderId}`);
    const invoiceId = res.data.order?.invoice_id || res.data.invoice?._id;
    if (!invoiceId) return;
    const receipt = await api.get(`/invoices/${invoiceId}/receipt`, { responseType: 'text' });
    const url = URL.createObjectURL(new Blob([receipt.data], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Initiate edit — show PIN modal first (master bypasses)
  const initiateEdit = (order) => {
    setPinTarget(order);
    if (isMaster) {
      openEditModal(order);
    } else {
      setPinVerified(false);
      setShowPin(true);
    }
  };

  const onPinSuccess = () => {
    setShowPin(false);
    setPinVerified(true);
    if (pinTarget) openEditModal(pinTarget);
  };

  const openEditModal = (order) => {
    setEditOrder(order);
    setEditForm({
      payment_mode: order.payment_mode,
      discount_amount: order.discount_amount || 0,
      final_amount: order.final_amount,
      notes: '',
    });
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await api.patch(`/audit/orders/${editOrder._id}/edit`, editForm);
      toast.success('Order updated successfully');
      setEditOrder(null);
      setPinTarget(null);
      setPinVerified(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* PIN Modal */}
      {showPin && (
        <EditPinModal
          franchiseId={franchiseId}
          isMaster={isMaster}
          onSuccess={onPinSuccess}
          onClose={() => { setShowPin(false); setPinTarget(null); }}
        />
      )}

      {/* Edit Order Modal */}
      {editOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <Shield size={16} className="text-brand-400" /> Edit Order
                </h2>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{editOrder.order_number}</p>
              </div>
              <button onClick={() => setEditOrder(null)} className="text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Payment Mode</label>
                <select
                  value={editForm.payment_mode}
                  onChange={(e) => setEditForm({ ...editForm, payment_mode: e.target.value })}
                  className="w-full bg-dark-700 border border-dark-500 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-brand-500"
                >
                  {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Discount Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.discount_amount}
                  onChange={(e) => setEditForm({ ...editForm, discount_amount: Number(e.target.value) })}
                  className="w-full bg-dark-700 border border-dark-500 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Final Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.final_amount}
                  onChange={(e) => setEditForm({ ...editForm, final_amount: Number(e.target.value) })}
                  className="w-full bg-dark-700 border border-dark-500 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Reason / Notes</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Reason for edit (optional but recommended)"
                  className="w-full bg-dark-700 border border-dark-500 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-brand-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditOrder(null)} className="flex-1 py-2.5 text-sm bg-dark-700 border border-dark-600 text-gray-300 rounded-xl hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-1 py-2.5 text-sm bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                Save Changes
              </button>
            </div>

            <p className="text-xs text-gray-600 text-center mt-3">
              This edit will be logged in the audit trail
            </p>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="section-title">Orders</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total orders</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadReport} className="btn-ghost flex items-center gap-2 py-2">
            <Download size={15} /> Download CSV
          </button>
          <button onClick={load} className="btn-ghost flex items-center gap-2 py-2">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input type="date" className="input w-44" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value, page: 1 })} />
        <div className="flex gap-2">
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => setFilters({ ...filters, status: s, page: 1 })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filters.status === s ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:text-white'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-700/50">
              <tr>{['Order #', 'Token', 'Customer', 'Items', 'Coupon', 'Discount', 'Amount', 'Payment', 'Visited As', 'Kitchen', 'Time', 'Actions'].map(h => <th key={h} className="table-head">{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : orders.map((order) => (
                <tr key={order._id} className="table-row">
                  <td className="table-cell font-mono text-brand-400 text-xs">{order.order_number}</td>
                  <td className="table-cell text-center">
                    <span className="w-7 h-7 bg-dark-600 rounded-full inline-flex items-center justify-center text-xs font-bold text-white">
                      {order.token_number}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="text-sm text-white">{order.customer_id?.name}</div>
                    <div className="text-xs text-gray-600">{order.customer_id?.phone_no}</div>
                  </td>
                  <td className="table-cell text-xs text-gray-500">{order.items?.length} items</td>
                  <td className="table-cell text-xs">
                    {order.coupon_code
                      ? <span className="bg-brand-500/10 text-brand-400 border border-brand-500/20 px-2 py-0.5 rounded-full font-mono text-[10px]">{order.coupon_code}</span>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="table-cell font-mono text-xs text-red-400">
                    {(order.total_discount || order.discount_amount || 0) > 0
                      ? <>-₹{(order.total_discount || order.discount_amount).toFixed(2)}</>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="table-cell font-mono text-green-400 font-semibold">₹{order.final_amount?.toLocaleString('en-IN')}</td>
                  <td className="table-cell">
                    <span className={`badge text-xs ${order.payment_mode === 'Cash' ? 'bg-green-500/10 text-green-400' : order.payment_mode === 'UPI' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                      {order.payment_mode}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className="badge text-xs bg-amber-500/10 text-amber-400 capitalize">
                      {order.visit_type || 'single'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={`badge status-${order.kitchen_status?.toLowerCase()}`}>
                      {order.kitchen_status}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-gray-600">
                    {order.createdAt ? format(new Date(order.createdAt), 'dd MMM, hh:mm a') : ''}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openReceipt(order._id)} className="text-gray-500 hover:text-brand-400 transition-colors" title="Reprint bill">
                        <Printer size={15} />
                      </button>
                      <button onClick={() => initiateEdit(order)} className="text-gray-500 hover:text-yellow-400 transition-colors" title="Edit order (requires PIN)">
                        <Pencil size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !orders.length && (
                <tr><td colSpan={9} className="text-center py-12 text-gray-600 text-sm">No orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
