import { useEffect, useState, useCallback } from 'react';
import {
  Package, AlertTriangle, XCircle, CheckCircle2, Plus, Minus,
  Search, RefreshCw, Trash2, X, Save, ShoppingCart, ClipboardList,
  ChevronDown, ChevronUp, TrendingDown, Truck,
} from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { getSocket, joinFranchiseRoom } from '../../lib/socket';

const UNITS = ['kg', 'g', 'litre', 'ml', 'pcs', 'plate', 'box', 'dozen', 'pack', 'bottle'];
const CATEGORIES = ['General', 'Vegetables', 'Dairy', 'Spices', 'Beverages', 'Grains', 'Meat', 'Packaging'];

const STATUS_CFG = {
  ok:  { label: 'In Stock',  color: 'text-green-400',  bg: 'bg-green-400/10',  Icon: CheckCircle2 },
  low: { label: 'Low Stock', color: 'text-yellow-400', bg: 'bg-yellow-400/10', Icon: AlertTriangle },
  out: { label: 'Out',       color: 'text-red-400',    bg: 'bg-red-400/10',    Icon: XCircle },
};

// ── Add / Edit Modal ──────────────────────────────────────────────
function MaterialModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: item?.name || '',
    category: item?.category || 'General',
    unit: item?.unit || 'kg',
    currentStock: item?.currentStock ?? 0,
    minStock: item?.minStock ?? 1,
    costPerUnit: item?.costPerUnit ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name required');
    setSaving(true);
    try {
      if (item) {
        await api.put(`/raw-materials/${item._id}`, form);
      } else {
        await api.post('/raw-materials', form);
      }
      toast.success(item ? 'Updated' : 'Created');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-bold text-lg">{item ? 'Edit Material' : 'Add Raw Material'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          {[['Name', 'name', 'text'], ['Min Stock Alert', 'minStock', 'number'], ['Cost Per Unit (₹)', 'costPerUnit', 'number']].map(([label, key, type]) => (
            <div key={key}>
              <label className="block text-xs text-gray-400 mb-1">{label}</label>
              <input type={type} value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
                className="w-full bg-dark-700 border border-dark-500 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
            </div>
          ))}
          {!item && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Opening Stock</label>
              <input type="number" value={form.currentStock}
                onChange={(e) => setForm({ ...form, currentStock: Number(e.target.value) })}
                className="w-full bg-dark-700 border border-dark-500 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Unit</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full bg-dark-700 border border-dark-500 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full bg-dark-700 border border-dark-500 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 bg-dark-700 border border-dark-500 text-gray-300 rounded-xl text-sm hover:bg-dark-600">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
            {item ? 'Update' : 'Add Material'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stock Update Modal ────────────────────────────────────────────
function StockModal({ item, type, onClose, onSaved }) {
  const [qty, setQty]           = useState(1);
  const [reason, setReason]     = useState('');
  const [supplier, setSupplier] = useState('');
  const [cost, setCost]         = useState(item?.costPerUnit || 0);
  const [saving, setSaving]     = useState(false);

  const submit = async () => {
    if (!qty || qty <= 0) return toast.error('Enter valid quantity');
    setSaving(true);
    try {
      await api.patch(`/raw-materials/${item._id}/stock`, {
        type, qty, reason, supplier, costPerUnit: cost,
      });
      toast.success(type === 'usage' ? 'Usage recorded' : 'Stock added');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const isUsage = type === 'usage';
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold">{isUsage ? '📉 Record Usage' : '📦 Add Purchase'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="mb-3 p-3 bg-dark-700 rounded-xl text-sm text-gray-300">
          <span className="font-semibold text-white">{item.name}</span>
          <span className="ml-2 text-gray-500">Current: {item.currentStock} {item.unit}</span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Quantity ({item.unit})</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setQty(Math.max(0.1, qty - 1))}
                className="w-9 h-9 bg-dark-700 rounded-lg text-gray-400 hover:text-white flex items-center justify-center"><Minus size={14} /></button>
              <input type="number" value={qty} min={0.1} step={0.1}
                onChange={(e) => setQty(Number(e.target.value))}
                className="flex-1 bg-dark-700 border border-dark-500 text-white text-center rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              <button onClick={() => setQty(qty + 1)}
                className="w-9 h-9 bg-dark-700 rounded-lg text-gray-400 hover:text-white flex items-center justify-center"><Plus size={14} /></button>
            </div>
          </div>
          {isUsage ? (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Reason (optional)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Morning prep"
                className="w-full bg-dark-700 border border-dark-500 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Supplier (optional)</label>
                <input value={supplier} onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Supplier name"
                  className="w-full bg-dark-700 border border-dark-500 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Cost Per Unit (₹)</label>
                <input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))}
                  className="w-full bg-dark-700 border border-dark-500 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
            </>
          )}
        </div>
        <button onClick={submit} disabled={saving}
          className={`w-full mt-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 text-white disabled:opacity-50
            ${isUsage ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'}`}>
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : isUsage ? <TrendingDown size={14} /> : <Truck size={14} />}
          {isUsage ? 'Record Usage' : 'Add to Stock'}
        </button>
      </div>
    </div>
  );
}

// ── Daily Usage / Approval Panel ─────────────────────────────────
function DailyUsagePanel({ onClose }) {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/raw-materials/daily-usage');
      setReport(res.data.report);
    } catch { toast.error('Failed to load'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (itemId, logId, action) => {
    try {
      await api.patch(`/raw-materials/${itemId}/approve-usage/${logId}`, { action });
      toast.success(action === 'approved' ? 'Approved' : 'Rejected');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <ClipboardList size={20} className="text-brand-400" /> Today's Usage Report
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {loading ? (
            <div className="text-center text-gray-500 py-10">Loading...</div>
          ) : report.length === 0 ? (
            <div className="text-center text-gray-500 py-10">No usage recorded today</div>
          ) : report.map((r) => (
            <div key={r.itemId} className="bg-dark-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-white font-semibold">{r.name}</div>
                  <div className="text-xs text-gray-400">Total used today: <span className="text-orange-400 font-mono">{r.todayUsage} {r.unit}</span></div>
                </div>
                <div className={`text-xs px-2 py-1 rounded-full ${STATUS_CFG[r.stockStatus]?.bg || 'bg-dark-600'} ${STATUS_CFG[r.stockStatus]?.color || 'text-gray-400'}`}>
                  {r.currentStock} {r.unit} left
                </div>
              </div>
              <div className="space-y-2">
                {r.logs.map((log) => (
                  <div key={log._id} className="flex items-center justify-between bg-dark-600 rounded-lg px-3 py-2 text-sm">
                    <div>
                      <span className="text-white font-mono">{log.qtyUsed} {r.unit}</span>
                      <span className="text-gray-400 ml-2">{log.reason || 'No reason'}</span>
                      <span className="text-gray-500 ml-2 text-xs">{log.role}</span>
                    </div>
                    {log.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button onClick={() => approve(r.itemId, log._id, 'approved')}
                          className="px-2 py-1 bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg text-xs hover:bg-green-500/30">
                          ✓ Approve
                        </button>
                        <button onClick={() => approve(r.itemId, log._id, 'rejected')}
                          className="px-2 py-1 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/30">
                          ✗ Reject
                        </button>
                      </div>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-full ${log.status === 'approved' ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                        {log.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function RawMaterialsPage() {
  const { user } = useAuthStore();
  const [items, setItems]         = useState([]);
  const [summary, setSummary]     = useState({});
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [alertOnly, setAlertOnly] = useState(false);
  const [modal, setModal]         = useState(null); // null | { type: 'add'|'edit'|'usage'|'purchase'|'daily', item? }

  const isOwner = ['master_admin', 'franchise_owner', 'manager'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (catFilter !== 'All') params.set('category', catFilter);
      if (alertOnly) params.set('stockAlert', 'true');
      const res = await api.get(`/raw-materials?${params}`);
      setItems(res.data.items);
      setSummary(res.data.summary);
    } catch { toast.error('Failed to load inventory'); }
    setLoading(false);
  }, [catFilter, alertOnly]);

  useEffect(() => { load(); }, [load]);

  // Real-time stock updates
  useEffect(() => {
    const fid = (user?.franchise_id?._id || user?.franchise_id)?.toString();
    if (!fid) return;
    joinFranchiseRoom(fid);
    const socket = getSocket();
    socket.on('stock:updated', load);
    return () => socket.off('stock:updated', load);
  }, [user, load]);

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this material?')) return;
    try {
      await api.delete(`/raw-materials/${id}`);
      toast.success('Deleted');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Package size={22} className="text-brand-400" /> Raw Materials & Stock
          </h1>
          <p className="text-sm text-gray-400 mt-1">Manage ingredients, track usage, monitor stock levels</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isOwner && (
            <button onClick={() => setModal({ type: 'daily' })}
              className="btn-secondary flex items-center gap-2 text-sm">
              <ClipboardList size={15} /> Daily Report
            </button>
          )}
          {isOwner && (
            <button onClick={() => setModal({ type: 'add' })}
              className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={15} /> Add Material
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Items', value: summary.total || 0, color: 'text-white',       Icon: Package },
          { label: 'In Stock',    value: summary.ok || 0,    color: 'text-green-400',   Icon: CheckCircle2 },
          { label: 'Low Stock',   value: summary.low || 0,   color: 'text-yellow-400',  Icon: AlertTriangle },
          { label: 'Out of Stock',value: summary.out || 0,   color: 'text-red-400',     Icon: XCircle },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className="stat-card">
            <div className={`w-9 h-9 rounded-xl bg-dark-600 flex items-center justify-center ${color}`}><Icon size={18} /></div>
            <div className="mt-3">
              <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials..."
            className="w-full bg-dark-700 border border-dark-600 text-white pl-8 pr-3 py-2 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="bg-dark-700 border border-dark-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
          {['All', ...CATEGORIES].map((c) => <option key={c}>{c}</option>)}
        </select>
        <button onClick={() => setAlertOnly((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${alertOnly ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-dark-700 border-dark-600 text-gray-400 hover:text-white'}`}>
          <AlertTriangle size={14} /> Low Stock Only
        </button>
        <button onClick={load} className="w-9 h-9 bg-dark-700 border border-dark-600 rounded-xl flex items-center justify-center text-gray-400 hover:text-white">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Items List */}
      {loading ? (
        <div className="text-center text-gray-500 py-20">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          {isOwner ? 'No materials found. Add your first raw material.' : 'No materials found.'}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((item) => {
            const cfg = STATUS_CFG[item.stockStatus] || STATUS_CFG.ok;
            return (
              <div key={item._id} className="bg-dark-800 border border-dark-700 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold truncate">{item.name}</span>
                      <span className="text-xs text-gray-500 bg-dark-700 px-2 py-0.5 rounded-full">{item.category}</span>
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        <cfg.Icon size={11} /> {cfg.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm">
                      <span className="text-gray-400">Stock: <span className="text-white font-mono font-bold">{item.currentStock} {item.unit}</span></span>
                      <span className="text-gray-400">Min: <span className="text-white font-mono">{item.minStock} {item.unit}</span></span>
                      {item.costPerUnit > 0 && <span className="text-gray-400">Cost: <span className="text-white font-mono">₹{item.costPerUnit}/{item.unit}</span></span>}
                    </div>
                    {/* Low stock progress bar */}
                    {item.currentStock >= 0 && item.minStock > 0 && (
                      <div className="mt-2 h-1.5 bg-dark-600 rounded-full overflow-hidden w-48 max-w-full">
                        <div
                          className={`h-full rounded-full transition-all ${item.stockStatus === 'out' ? 'bg-red-500' : item.stockStatus === 'low' ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, (item.currentStock / (item.minStock * 3)) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                    <button onClick={() => setModal({ type: 'usage', item })}
                      title="Record Usage"
                      className="flex items-center gap-1 px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-xl text-xs hover:bg-orange-500/20 transition-colors">
                      <TrendingDown size={12} /> Use
                    </button>
                    {isOwner && (
                      <>
                        <button onClick={() => setModal({ type: 'purchase', item })}
                          title="Add Purchase"
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl text-xs hover:bg-green-500/20 transition-colors">
                          <Truck size={12} /> Buy
                        </button>
                        <button onClick={() => setModal({ type: 'edit', item })}
                          className="w-8 h-8 bg-dark-700 border border-dark-600 rounded-xl flex items-center justify-center text-gray-400 hover:text-white">
                          <RefreshCw size={13} />
                        </button>
                        <button onClick={() => deleteItem(item._id)}
                          className="w-8 h-8 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/20">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'add'      && <MaterialModal onClose={() => setModal(null)} onSaved={load} />}
      {modal?.type === 'edit'     && <MaterialModal item={modal.item} onClose={() => setModal(null)} onSaved={load} />}
      {modal?.type === 'usage'    && <StockModal item={modal.item} type="usage"    onClose={() => setModal(null)} onSaved={load} />}
      {modal?.type === 'purchase' && <StockModal item={modal.item} type="purchase" onClose={() => setModal(null)} onSaved={load} />}
      {modal?.type === 'daily'    && <DailyUsagePanel onClose={() => setModal(null)} />}
    </div>
  );
}
