import { useEffect, useState, useCallback } from 'react';
import {
  Package, AlertTriangle, XCircle, CheckCircle2,
  Plus, Minus, Pencil, Search, RefreshCw, Settings2,
  Trash2, X, Save, ChevronDown, IndianRupee, Leaf, Flame,
} from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'plate', 'box', 'dozen', 'pack'];
const GST_RATES = [0, 5, 12, 18, 28];

const EMPTY_FORM = {
  name: '', category: '', price: '', gst_rate: 5, hsn_code: '',
  description: '', isVeg: true, preparationTime: 10,
  stock_enabled: false, stock_qty: 0, unit: 'pcs', low_stock_threshold: 10,
};

/* ── Add / Edit Item Modal ───────────────────────────────── */
function ItemModal({ item, categories, onClose, onSaved }) {
  const isEdit = !!item;
  const [form, setForm] = useState(isEdit ? {
    name: item.name, category: item.category, price: item.price,
    gst_rate: item.gst_rate, hsn_code: item.hsn_code || '',
    description: item.description || '', isVeg: item.isVeg,
    preparationTime: item.preparationTime || 10,
    stock_enabled: item.stock_enabled, stock_qty: item.stock_qty,
    unit: item.unit || 'pcs', low_stock_threshold: item.low_stock_threshold || 10,
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim())     { toast.error('Name required'); return; }
    if (!form.category.trim()) { toast.error('Category required'); return; }
    if (!form.price)           { toast.error('Price required'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/inventory/items/${item._id}`, form);
        toast.success('Item updated');
      } else {
        await api.post('/inventory/items', form);
        toast.success('Item added');
      }
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-dark-700 sticky top-0 bg-dark-800 z-10">
          <h2 className="text-base font-bold text-white">{isEdit ? 'Edit Item' : 'Add New Item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name + Veg toggle */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Item Name *</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Masala Dosa"
                className="input w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <button onClick={() => set('isVeg', !form.isVeg)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  form.isVeg ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-red-500/10 border-red-500 text-red-400'
                }`}>
                {form.isVeg ? <Leaf size={14} /> : <Flame size={14} />}
                {form.isVeg ? 'Veg' : 'Non-Veg'}
              </button>
            </div>
          </div>

          {/* Category + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category *</label>
              <select value={form.category} onChange={(e) => set('category', e.target.value)} className="input w-full">
                <option value="">Select category</option>
                {categories.map((c) => <option key={c._id} value={c.name}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Price (₹) *</label>
              <div className="relative">
                <IndianRupee size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="number" value={form.price} onChange={(e) => set('price', e.target.value)}
                  placeholder="0.00" min={0} className="input w-full pl-8" />
              </div>
            </div>
          </div>

          {/* GST + HSN */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">GST Rate</label>
              <select value={form.gst_rate} onChange={(e) => set('gst_rate', Number(e.target.value))} className="input w-full">
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">HSN Code</label>
              <input value={form.hsn_code} onChange={(e) => set('hsn_code', e.target.value)}
                placeholder="e.g. 2106" className="input w-full" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
              rows={2} placeholder="Optional description"
              className="input w-full resize-none" />
          </div>

          {/* Prep time */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Preparation Time (mins)</label>
            <input type="number" value={form.preparationTime} min={1}
              onChange={(e) => set('preparationTime', Number(e.target.value))} className="input w-32" />
          </div>

          {/* Stock section */}
          <div className="border-t border-dark-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-white">Stock Tracking</label>
              <button onClick={() => set('stock_enabled', !form.stock_enabled)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  form.stock_enabled ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-dark-700 border-dark-500 text-gray-400'
                }`}>
                {form.stock_enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            {form.stock_enabled && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Qty in Stock</label>
                  <input type="number" value={form.stock_qty} min={0}
                    onChange={(e) => set('stock_qty', Number(e.target.value))} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Unit</label>
                  <select value={form.unit} onChange={(e) => set('unit', e.target.value)} className="input w-full">
                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Low Alert At</label>
                  <input type="number" value={form.low_stock_threshold} min={0}
                    onChange={(e) => set('low_stock_threshold', Number(e.target.value))} className="input w-full" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-dark-700 sticky bottom-0 bg-dark-800">
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-dark-700 text-gray-300 rounded-xl hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2 text-sm bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Update Item' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_CONFIG = {
  ok:        { label: 'In Stock',  color: 'text-green-400',  bg: 'bg-green-400/10',  Icon: CheckCircle2 },
  low:       { label: 'Low Stock', color: 'text-yellow-400', bg: 'bg-yellow-400/10', Icon: AlertTriangle },
  out:       { label: 'Out',       color: 'text-red-400',    bg: 'bg-red-400/10',    Icon: XCircle },
  untracked: { label: 'Untracked', color: 'text-gray-500',   bg: 'bg-dark-600',      Icon: Package },
};

function SummaryCard({ label, value, color = 'text-white', icon: Icon }) {
  return (
    <div className="stat-card">
      <div className={`w-9 h-9 rounded-xl bg-dark-600 flex items-center justify-center ${color}`}>
        <Icon size={18} />
      </div>
      <div className="mt-3">
        <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

/* ── Inline stock editor ─────────────────────────────────── */
function StockEditor({ item, onSaved }) {
  const [qty, setQty]       = useState(item.stock_qty ?? 0);
  const [unit, setUnit]     = useState(item.unit || 'pcs');
  const [thresh, setThresh] = useState(item.low_stock_threshold ?? 10);
  const [enabled, setEnabled] = useState(item.stock_enabled ?? false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/inventory/${item._id}/stock`, {
        stock_qty: qty, unit, low_stock_threshold: thresh, stock_enabled: enabled,
      });
      toast.success('Stock updated');
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-3 pt-3 border-t border-dark-600 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Track Stock</label>
        <button
          onClick={() => setEnabled((v) => !v)}
          className={`w-full py-2 rounded-lg text-xs font-medium border transition-colors ${
            enabled ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-dark-700 border-dark-500 text-gray-400'
          }`}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Qty in Stock</label>
        <div className="flex items-center gap-1">
          <button onClick={() => setQty(Math.max(0, qty - 1))} className="w-7 h-8 bg-dark-700 rounded-lg text-gray-400 hover:text-white flex items-center justify-center">
            <Minus size={12} />
          </button>
          <input type="number" value={qty} min={0} onChange={(e) => setQty(Number(e.target.value))}
            className="flex-1 bg-dark-700 border border-dark-500 text-white text-center text-sm rounded-lg py-1.5 focus:outline-none focus:border-brand-500 w-0" />
          <button onClick={() => setQty(qty + 1)} className="w-7 h-8 bg-dark-700 rounded-lg text-gray-400 hover:text-white flex items-center justify-center">
            <Plus size={12} />
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Unit</label>
        <select value={unit} onChange={(e) => setUnit(e.target.value)}
          className="w-full bg-dark-700 border border-dark-500 text-white text-sm rounded-lg py-1.5 px-2 focus:outline-none focus:border-brand-500">
          {UNITS.map((u) => <option key={u}>{u}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Low Alert At</label>
        <input type="number" value={thresh} min={0} onChange={(e) => setThresh(Number(e.target.value))}
          className="w-full bg-dark-700 border border-dark-500 text-white text-sm rounded-lg py-1.5 px-2 focus:outline-none focus:border-brand-500" />
      </div>
      <div className="col-span-2 sm:col-span-4">
        <button onClick={save} disabled={saving}
          className="px-5 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 flex items-center gap-2">
          {saving ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save size={13} />}
          Save
        </button>
      </div>
    </div>
  );
}

/* ── Category manager (master only) ─────────────────────── */
function CategoryManager({ categories, onRefresh }) {
  const [form, setForm]   = useState({ name: '', icon: '🍽️', color: '#f97316' });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/categories/${editId}`, form);
        toast.success('Category updated');
      } else {
        await api.post('/categories', form);
        toast.success('Category created');
      }
      setForm({ name: '', icon: '🍽️', color: '#f97316' });
      setEditId(null);
      onRefresh();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Error');
    } finally { setSaving(false); }
  };

  const startEdit = (cat) => {
    setEditId(cat._id);
    setForm({ name: cat.name, icon: cat.icon, color: cat.color });
  };

  const deletecat = async (id) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await api.delete(`/categories/${id}`);
      toast.success('Deleted');
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
        <Settings2 size={15} className="text-brand-400" /> Category Management
      </h2>

      {/* Add / Edit form */}
      <div className="flex flex-wrap gap-2">
        <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}
          placeholder="🍽️" className="w-14 bg-dark-700 border border-dark-500 text-white text-center text-lg rounded-xl px-2 py-2 focus:outline-none focus:border-brand-500" />
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Category name" className="flex-1 min-w-32 bg-dark-700 border border-dark-500 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-brand-500" />
        <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
          className="w-12 h-10 bg-dark-700 border border-dark-500 rounded-xl cursor-pointer" />
        <button onClick={submit} disabled={saving}
          className="px-4 py-2 text-sm bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-50">
          {editId ? 'Update' : 'Add'}
        </button>
        {editId && (
          <button onClick={() => { setEditId(null); setForm({ name: '', icon: '🍽️', color: '#f97316' }); }}
            className="px-3 py-2 text-sm bg-dark-700 text-gray-400 rounded-xl hover:text-white">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Category list */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <div key={cat._id} className="flex items-center gap-2 bg-dark-700 border border-dark-600 rounded-xl px-3 py-1.5 group">
            <span>{cat.icon}</span>
            <span className="text-sm font-medium" style={{ color: cat.color }}>{cat.name}</span>
            <div className="hidden group-hover:flex items-center gap-1 ml-1">
              <button onClick={() => startEdit(cat)} className="text-gray-500 hover:text-brand-400 transition-colors"><Pencil size={12} /></button>
              <button onClick={() => deletecat(cat._id)} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────── */
export default function InventoryPage() {
  const { user } = useAuthStore();
  const isMaster = user?.role === 'master_admin';

  const [items, setItems]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary]       = useState({});
  const [loading, setLoading]       = useState(true);
  const [catFilter, setCatFilter]   = useState('All');
  const [alertOnly, setAlertOnly]   = useState(false);
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [modalItem, setModalItem]   = useState(null);   // null=closed, false=add new, item=edit
  const canAdmin = ['master_admin', 'franchise_owner'].includes(user?.role);

  const loadCategories = useCallback(async () => {
    const res = await api.get('/categories?all=true');
    setCategories(res.data.categories || []);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (catFilter !== 'All') params.append('category', catFilter);
      if (alertOnly) params.append('stockAlert', 'true');
      const res = await api.get(`/inventory?${params}`);
      setItems(res.data.items);
      setSummary(res.data.summary || {});
    } finally { setLoading(false); }
  }, [catFilter, alertOnly]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const filtered = items.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {modalItem !== null && (
        <ItemModal
          item={modalItem || null}
          categories={categories}
          onClose={() => setModalItem(null)}
          onSaved={() => { setModalItem(null); loadItems(); }}
        />
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Package size={22} className="text-brand-400" /> Inventory
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Stock & unit management</p>
        </div>
        <div className="flex items-center gap-2">
          {canAdmin && (
            <button onClick={() => setModalItem(false)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors font-medium">
              <Plus size={13} /> Add Item
            </button>
          )}
          {isMaster && (
            <button onClick={() => setShowCatMgr((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-dark-700 border border-dark-500 text-gray-300 rounded-lg hover:text-white hover:border-brand-500 transition-colors">
              <Settings2 size={13} /> Categories
            </button>
          )}
          <button onClick={loadItems}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-dark-700 border border-dark-500 text-gray-300 rounded-lg hover:text-white transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Items"   value={summary.total   || 0} icon={Package}       color="text-white" />
        <SummaryCard label="Tracked"       value={summary.tracked || 0} icon={CheckCircle2}  color="text-blue-400" />
        <SummaryCard label="Low Stock"     value={summary.low     || 0} icon={AlertTriangle} color="text-yellow-400" />
        <SummaryCard label="Out of Stock"  value={summary.out     || 0} icon={XCircle}       color="text-red-400" />
      </div>

      {/* Category manager */}
      {isMaster && showCatMgr && (
        <CategoryManager categories={categories} onRefresh={() => { loadCategories(); loadItems(); }} />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full bg-dark-700 border border-dark-500 text-white text-sm placeholder-gray-500 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-brand-500" />
        </div>
        <button onClick={() => setAlertOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl border font-medium transition-colors ${
            alertOnly ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-dark-700 border-dark-500 text-gray-400 hover:text-white'
          }`}>
          <AlertTriangle size={13} /> Alerts Only
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {['All', ...categories.map((c) => c.name)].map((cat) => (
          <button key={cat} onClick={() => setCatFilter(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              catFilter === cat
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'border-dark-500 text-gray-400 hover:text-white hover:border-gray-500'
            }`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Items list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const status = STATUS_CONFIG[item.stock_status] || STATUS_CONFIG.untracked;
            const isOpen = expanded === item._id;
            return (
              <div key={item._id} className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-dark-700/50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : item._id)}>

                  {/* Item image / veg indicator */}
                  <div className="w-10 h-10 rounded-xl bg-dark-700 flex items-center justify-center shrink-0 overflow-hidden">
                    {item.image?.url
                      ? <img src={item.image.url} alt={item.name} className="w-full h-full object-cover" />
                      : <span className="text-lg">{item.isVeg ? '🟢' : '🔴'}</span>
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium truncate">{item.name}</span>
                      {!item.isGlobalActive && <span className="text-xs text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full">Inactive</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                      <span>{item.category}</span>
                      <span className="text-green-400 font-mono">₹{item.price}</span>
                      {item.stock_enabled && (
                        <span className="font-mono">
                          {item.stock_qty} {item.unit}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stock status badge */}
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color} shrink-0`}>
                    <status.Icon size={12} />
                    {status.label}
                  </div>

                  {/* Edit / Delete */}
                  {canAdmin && (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setModalItem(item)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-dark-700 text-gray-400 hover:text-brand-400 transition-colors">
                        <Pencil size={13} />
                      </button>
                      {isMaster && (
                        <button onClick={async () => {
                          if (!window.confirm(`Delete "${item.name}"?`)) return;
                          try { await api.delete(`/inventory/items/${item._id}`); toast.success('Deleted'); loadItems(); }
                          catch (e) { toast.error(e.response?.data?.message || 'Error'); }
                        }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-dark-700 text-gray-400 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}

                  <ChevronDown size={16} className={`text-gray-500 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                </div>

                {/* Expandable stock editor */}
                {isOpen && (
                  <div className="px-4 pb-4">
                    <StockEditor item={item} onSaved={() => { setExpanded(null); loadItems(); }} />
                  </div>
                )}
              </div>
            );
          })}

          {!filtered.length && (
            <div className="text-center py-16 text-gray-500 text-sm">
              {alertOnly ? 'No stock alerts 🎉' : 'No items found'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
