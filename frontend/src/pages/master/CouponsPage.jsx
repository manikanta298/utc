import { useEffect, useState } from 'react';
import { Tag, Plus, Trash2, Edit2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const EMPTY_FORM = {
  code: '', description: '', discountType: 'percentage', discountValue: '',
  isHidden: true, isActive: true, maxUses: '', minOrderAmount: '', maxDiscountAmount: '', expiresAt: '',
};

export default function CouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/coupons');
      setCoupons(res.data.coupons || []);
    } catch { toast.error('Failed to load coupons'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setShowForm(true); };
  const openEdit = (c) => {
    setForm({
      code: c.code, description: c.description || '', discountType: c.discountType,
      discountValue: c.discountValue, isHidden: c.isHidden, isActive: c.isActive,
      maxUses: c.maxUses || '', minOrderAmount: c.minOrderAmount || '',
      maxDiscountAmount: c.maxDiscountAmount || '',
      expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString().split('T')[0] : '',
    });
    setEditId(c._id);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.code || !form.discountValue) return toast.error('Code and discount value required');
    setSaving(true);
    try {
      const payload = { ...form, discountValue: Number(form.discountValue) };
      if (editId) { await api.put(`/coupons/${editId}`, payload); toast.success('Coupon updated'); }
      else { await api.post('/coupons', payload); toast.success('Coupon created'); }
      setShowForm(false);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (id, code) => {
    if (!window.confirm(`Delete coupon ${code}?`)) return;
    try {
      await api.delete(`/coupons/${id}`);
      toast.success('Coupon deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  const toggle = async (c) => {
    try {
      await api.put(`/coupons/${c._id}`, { isActive: !c.isActive });
      toast.success(c.isActive ? 'Coupon deactivated' : 'Coupon activated');
      load();
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Tag size={20} className="text-brand-400" /> Coupon Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Hidden coupons visible only to Master Admin</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-xl">
          <Plus size={16} /> New Coupon
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-dark-700" />)}
        </div>
      ) : coupons.length === 0 ? (
        <div className="card p-12 text-center">
          <Tag size={40} className="mx-auto text-gray-600 mb-3" />
          <div className="text-gray-400">No coupons created yet.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((c) => (
            <div key={c._id} className={`card p-4 flex items-center gap-4 ${!c.isActive ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-brand-400 text-lg">{c.code}</span>
                  {c.isHidden && (
                    <span className="flex items-center gap-1 text-xs text-purple-400 border border-purple-400/30 bg-purple-400/10 rounded-full px-2 py-0.5">
                      <EyeOff size={10} /> Hidden
                    </span>
                  )}
                  {!c.isActive && (
                    <span className="text-xs text-red-400 border border-red-400/30 bg-red-400/10 rounded-full px-2 py-0.5">Inactive</span>
                  )}
                </div>
                <div className="text-sm text-gray-400 mt-0.5">
                  {c.discountType === 'percentage' ? `${c.discountValue}% OFF` : `₹${c.discountValue} OFF`}
                  {c.minOrderAmount > 0 && ` · Min ₹${c.minOrderAmount}`}
                  {c.maxUses > 0 && ` · ${c.usedCount}/${c.maxUses} used`}
                  {c.expiresAt && ` · Expires ${new Date(c.expiresAt).toLocaleDateString()}`}
                </div>
                {c.description && <div className="text-xs text-gray-600 mt-0.5">{c.description}</div>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggle(c)} className={`p-1.5 rounded-lg ${c.isActive ? 'text-green-400 hover:bg-green-400/10' : 'text-gray-500 hover:bg-gray-400/10'}`}>
                  {c.isActive ? <CheckCircle size={16} /> : <XCircle size={16} />}
                </button>
                <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-gray-400 hover:bg-dark-600 hover:text-white">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => remove(c._id, c.code)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm overflow-y-auto p-4">
          <div className="card w-full max-w-lg p-6 space-y-4 my-auto">
            <h2 className="text-lg font-bold text-white">{editId ? 'Edit Coupon' : 'New Coupon'}</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Coupon Code *</label>
                <input className="input uppercase" placeholder="e.g. SAVE100" value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="label">Discount Type *</label>
                <select className="input" value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Fixed Amount (₹)</option>
                </select>
              </div>
              <div>
                <label className="label">Discount Value *</label>
                <input className="input" type="number" min={0} placeholder={form.discountType === 'percentage' ? '10' : '100'}
                  value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
              </div>
              <div>
                <label className="label">Max Uses (0 = unlimited)</label>
                <input className="input" type="number" min={0} value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
              </div>
              <div>
                <label className="label">Min Order Amount (₹)</label>
                <input className="input" type="number" min={0} value={form.minOrderAmount}
                  onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} />
              </div>
              <div>
                <label className="label">Max Discount Cap (₹, 0 = no cap)</label>
                <input className="input" type="number" min={0} value={form.maxDiscountAmount}
                  onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })} />
              </div>
              <div>
                <label className="label">Expires On</label>
                <input className="input" type="date" value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isHidden}
                    onChange={(e) => setForm({ ...form, isHidden: e.target.checked })} className="accent-brand-500" />
                  <span className="text-sm text-gray-300 flex items-center gap-1"><EyeOff size={13} /> Hidden from franchise owners</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="accent-brand-500" />
                  <span className="text-sm text-gray-300">Active</span>
                </label>
              </div>
            </div>

            <div>
              <label className="label">Description (optional)</label>
              <input className="input" placeholder="Internal note about this coupon" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 btn-ghost py-2 rounded-xl text-sm">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 btn-primary py-2 rounded-xl text-sm">
                {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
