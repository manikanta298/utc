import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, Upload, Search, X, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const CATEGORIES = ['Beverages', 'Snacks', 'Meals', 'Desserts', 'Breads', 'Specials', 'Add-ons'];
const GST_RATES = [0, 5, 12, 18, 28];

const STATUS_TABS = [
  { key: 'all',      label: 'All Items' },
  { key: 'active',   label: '✅ Active' },
  { key: 'inactive', label: '⛔ Inactive' },
];

const ItemModal = ({ item, onClose, onSaved }) => {
  const isEdit = !!item?._id;
  const [form, setForm] = useState({
    name: item?.name || '',
    description: item?.description || '',
    category: item?.category || 'Beverages',
    price: item?.price || '',
    gst_rate: item?.gst_rate || 5,
    hsn_code: item?.hsn_code || '',
    isVeg: item?.isVeg !== false,
    preparationTime: item?.preparationTime || 10,
    isGlobalActive: item?.isGlobalActive !== false,
    sortOrder: item?.sortOrder || 0,
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(item?.image?.url || '');
  const [saving, setSaving] = useState(false);

  const handleImage = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (imageFile) fd.append('image', imageFile);
      if (isEdit) {
        await api.put(`/menu/${item._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Item updated');
      } else {
        await api.post('/menu', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Item created');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving item');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-dark-600">
          <h2 className="font-display text-xl font-bold text-white">{isEdit ? 'Edit Item' : 'Add Menu Item'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="label">Item Image (Cloudinary)</label>
            <div className="flex gap-4 items-start">
              <div className="w-24 h-24 bg-dark-700 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0">
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <Upload size={24} className="text-gray-600" />
                )}
              </div>
              <div className="flex-1">
                <label className="btn-ghost text-sm cursor-pointer inline-flex items-center gap-2">
                  <Upload size={16} /> Choose Image
                  <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
                </label>
                <p className="text-xs text-gray-600 mt-1">JPG, PNG, WEBP — max 5MB</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Item Name *</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">Description</label>
              <textarea className="input resize-none" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="label">Category *</label>
              <input className="input" list="cat-list" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
              <datalist id="cat-list">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="label">Price (₹) *</label>
              <input className="input" type="number" min="0" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <label className="label">GST Rate (%)</label>
              <select className="input" value={form.gst_rate} onChange={(e) => setForm({ ...form, gst_rate: Number(e.target.value) })}>
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label className="label">HSN Code</label>
              <input className="input" value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} placeholder="e.g. 2101" />
            </div>
            <div>
              <label className="label">Prep Time (min)</label>
              <input className="input" type="number" min="1" value={form.preparationTime} onChange={(e) => setForm({ ...form, preparationTime: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Sort Order</label>
              <input className="input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isVeg} onChange={(e) => setForm({ ...form, isVeg: e.target.checked })} className="w-4 h-4 accent-green-500" />
              <span className="text-sm text-gray-300">🌿 Vegetarian</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isGlobalActive} onChange={(e) => setForm({ ...form, isGlobalActive: e.target.checked })} className="w-4 h-4 accent-brand-500" />
              <span className="text-sm text-gray-300">Active (show on POS)</span>
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function MasterMenuPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [modal, setModal] = useState(null);
  const [toggling, setToggling] = useState(null);
  const searchTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/menu/all');
      setItems(res.data.items);
    } catch { toast.error('Failed to load menu'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(val), 250);
  };

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Delete this item?')) return;
    try {
      await api.delete(`/menu/${id}`);
      toast.success('Item deleted');
      load();
    } catch { toast.error('Delete failed'); }
  }, [load]);

  const handleGlobalToggle = useCallback(async (item) => {
    setToggling(item._id);
    try {
      const res = await api.patch(`/menu/${item._id}/global-toggle`);
      const nowActive = res.data.isGlobalActive;
      toast.success(`${item.name} → ${nowActive ? '✅ Active' : '⛔ Inactive'}`);
      setStatusTab(nowActive ? 'active' : 'inactive');
      load();
    } catch { toast.error('Toggle failed'); }
    setToggling(null);
  }, [load]);

  const counts = useMemo(() => ({
    all:      items.length,
    active:   items.filter((i) => i.isGlobalActive).length,
    inactive: items.filter((i) => !i.isGlobalActive).length,
  }), [items]);

  const filtered = useMemo(() => items.filter((i) => {
    const matchSearch = !debouncedSearch || i.name.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchCat    = !catFilter || i.category === catFilter;
    const matchStatus = statusTab === 'all' || (statusTab === 'active' ? i.isGlobalActive : !i.isGlobalActive);
    return matchSearch && matchCat && matchStatus;
  }), [items, debouncedSearch, catFilter, statusTab]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Menu Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            {counts.active} active · {counts.inactive} inactive · {counts.all} total
          </p>
        </div>
        <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Item
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap mb-4">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusTab(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              statusTab === key
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'bg-dark-700 border-dark-500 text-gray-400 hover:text-white'
            }`}
          >
            {label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${statusTab === key ? 'bg-white/20' : 'bg-dark-600'}`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Category + Search filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-9 w-56" placeholder="Search items..." value={search} onChange={handleSearchChange} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['', ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${catFilter === c ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:text-white'}`}>
              {c || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">🍽️</div>
          <p className="text-gray-500 text-sm">No items match this filter</p>
          <button onClick={() => { setStatusTab('all'); setCatFilter(''); setSearch(''); }}
            className="mt-3 text-xs text-brand-400 hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <div key={item._id} className={`card-hover overflow-hidden group ${!item.isGlobalActive ? 'opacity-60' : ''}`}>
              <div className="h-40 bg-dark-700 relative overflow-hidden">
                {item.image?.url ? (
                  <img src={item.image.url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
                )}
                <div className="absolute top-2 left-2">
                  {item.isVeg
                    ? <span className="w-5 h-5 rounded border-2 border-green-500 bg-green-500/20 flex items-center justify-center"><span className="w-2.5 h-2.5 bg-green-500 rounded-full" /></span>
                    : <span className="w-5 h-5 rounded border-2 border-red-500 bg-red-500/20 flex items-center justify-center"><span className="w-2.5 h-2.5 bg-red-500 rounded-full" /></span>
                  }
                </div>
                {!item.isGlobalActive && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="badge bg-red-500/20 text-red-400 border border-red-500/30">⛔ Inactive</span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-semibold text-white text-sm leading-tight">{item.name}</div>
                  <div className="text-brand-400 font-bold font-mono text-sm flex-shrink-0">₹{item.price}</div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="badge bg-dark-600 text-gray-400 border-0 text-[10px]">{item.category}</span>
                  <span className="badge bg-dark-600 text-gray-500 border-0 text-[10px]">GST {item.gst_rate}%</span>
                </div>
                <div className="flex gap-2">
                  {/* Quick toggle */}
                  <button
                    onClick={() => handleGlobalToggle(item)}
                    disabled={toggling === item._id}
                    title={item.isGlobalActive ? 'Mark Inactive' : 'Mark Active'}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors disabled:opacity-50"
                  >
                    {toggling === item._id
                      ? <div className="w-4 h-4 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                      : item.isGlobalActive
                        ? <ToggleRight size={16} className="text-green-400" />
                        : <ToggleLeft size={16} className="text-gray-500" />
                    }
                  </button>
                  <button onClick={() => setModal(item)} className="btn-ghost flex-1 py-1.5 text-xs flex items-center justify-center gap-1">
                    <Pencil size={13} /> Edit
                  </button>
                  <button onClick={() => handleDelete(item._id)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg px-3 py-1.5 text-xs transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ItemModal
          item={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
