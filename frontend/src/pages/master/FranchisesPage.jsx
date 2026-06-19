import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Building2, MapPin, FileText, X, Archive, Lock,
  RotateCcw, Trash2, Users, ArrowLeft, Pencil, UserCheck,
  UserX, Phone, Mail, ChevronRight,
} from 'lucide-react';
import api from '../../lib/api';
import FranchisePaymentSetup from './FranchisePaymentSetup';
import toast from 'react-hot-toast';

const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Puducherry'];

const STAFF_ROLES = ['franchise_owner','manager','pos_staff','shift_operator','kitchen_staff','waiter'];
const ROLE_LABELS = {
  franchise_owner:'Franchise Owner', manager:'Manager', pos_staff:'POS Staff',
  shift_operator:'Shift Operator', kitchen_staff:'Kitchen Staff', waiter:'Waiter',
};
const ROLE_COLORS = {
  franchise_owner:'bg-blue-500/10 text-blue-400', manager:'bg-teal-500/10 text-teal-400',
  pos_staff:'bg-green-500/10 text-green-400', shift_operator:'bg-green-500/10 text-green-400',
  kitchen_staff:'bg-orange-500/10 text-orange-400', waiter:'bg-yellow-500/10 text-yellow-400',
};
const STATUS_META = {
  active:   { label:'Active',   className:'bg-green-500/10 text-green-400' },
  inactive: { label:'Inactive', className:'bg-red-500/10 text-red-400' },
  archived: { label:'Archived', className:'bg-gray-500/10 text-gray-300' },
};
const getFranchiseStatus = (f) => f.status || (f.isActive ? 'active' : 'inactive');

const EMPTY_STAFF = { name:'', email:'', password:'', role:'pos_staff', phone:'' };

/* ── Staff Modal ─────────────────────────────────────────── */
function StaffModal({ staff, franchiseId, onClose, onSaved }) {
  const isEdit = !!staff;
  const [form, setForm] = useState(isEdit
    ? { name: staff.name, email: staff.email, password: '', role: staff.role, phone: staff.phone || '' }
    : { ...EMPTY_STAFF }
  );
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/staff/${staff._id}`, { ...form, franchise_id: franchiseId });
        toast.success('Staff updated');
      } else {
        await api.post('/auth/create-staff', { ...form, franchise_id: franchiseId });
        toast.success('Staff created');
      }
      onSaved();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <h2 className="font-bold text-white">{isEdit ? 'Edit Staff' : 'Add Staff'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {[
            { label:'Full Name', key:'name', type:'text', required:true },
            { label:'Email',     key:'email',type:'email',required:true },
            { label:'Password',  key:'password',type:'password', required:!isEdit, placeholder: isEdit ? 'Leave blank to keep current' : '' },
            { label:'Phone',     key:'phone', type:'tel', required:false },
          ].map(({ label, key, type, required, placeholder }) => (
            <div key={key}>
              <label className="block text-xs text-gray-400 mb-1">{label}</label>
              <input className="input w-full" type={type} required={required}
                placeholder={placeholder || ''} value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Role</label>
            <select className="input w-full" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Franchise Detail Panel ──────────────────────────────── */
function FranchiseDetail({ franchise, onBack, onRefresh }) {
  const [staff, setStaff]               = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [staffModal, setStaffModal]     = useState(null); // null | false | staffObj
  const [activeTab, setActiveTab]       = useState('info'); // 'info' | 'staff'
  const [paymentSetup, setPaymentSetup] = useState(false);
  const [editFranchise, setEditFranchise] = useState(false);
  const [form, setForm] = useState({
    name: franchise.name, location: franchise.location || '', city: franchise.city,
    state: franchise.state, gstin: franchise.gstin, phone: franchise.phone || '',
    email: franchise.email || '', address: franchise.address || '',
  });

  const loadStaff = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const res = await api.get('/staff');
      const all = res.data.staff || [];
      setStaff(all.filter((s) => s.franchise_id?._id === franchise._id || s.franchise_id === franchise._id));
    } catch { toast.error('Failed to load staff'); }
    finally { setLoadingStaff(false); }
  }, [franchise._id]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const toggleActive = async (id) => {
    try { await api.put(`/staff/${id}/toggle`); toast.success('Status updated'); loadStaff(); }
    catch { toast.error('Failed'); }
  };

  const deleteStaff = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try { await api.delete(`/staff/${id}`); toast.success('Deleted'); loadStaff(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/franchises/${franchise._id}`, form);
      toast.success('Franchise updated');
      setEditFranchise(false);
      onRefresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const status     = getFranchiseStatus(franchise);
  const statusMeta = STATUS_META[status] || STATUS_META.inactive;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm">
          <ArrowLeft size={16} /> Back to Franchises
        </button>
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-500/15 rounded-xl flex items-center justify-center">
              <Building2 size={24} className="text-brand-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{franchise.name}</h1>
              <div className="text-xs font-mono text-brand-400 mt-0.5">{franchise.franchiseCode}</div>
            </div>
          </div>
          <span className={`badge ${statusMeta.className}`}>{statusMeta.label}</span>
        </div>

        {/* Tabs */}
        <div className="flex bg-dark-700 rounded-xl p-1 gap-1 mt-5">
          {[
            { id:'info',  label:'Franchise Info' },
            { id:'staff', label:`Staff (${staff.length})` },
          ].map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === t.id ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* INFO TAB */}
      {activeTab === 'info' && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5 space-y-4">
          {!editFranchise ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label:'City',    value: franchise.city },
                  { label:'State',   value: franchise.state },
                  { label:'GSTIN',   value: franchise.gstin, mono: true },
                  { label:'Location',value: franchise.location || '—' },
                  { label:'Phone',   value: franchise.phone || '—' },
                  { label:'Email',   value: franchise.email || '—' },
                  { label:'Address', value: franchise.address || '—', full: true },
                  { label:'Owner',   value: franchise.owner_id?.name || '—' },
                ].map(({ label, value, mono, full }) => (
                  <div key={label} className={full ? 'col-span-2' : ''}>
                    <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                    <div className={`text-white ${mono ? 'font-mono' : ''}`}>{value}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-3 border-t border-dark-700">
                <button onClick={() => setEditFranchise(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-dark-700 text-gray-300 rounded-lg hover:text-white transition-colors">
                  <Pencil size={12} /> Edit Details
                </button>
                <button onClick={() => setPaymentSetup(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-lg hover:bg-brand-500/20 transition-colors">
                  Payment Setup
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={saveEdit} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Franchise Name *</label>
                <input className="input w-full" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">City *</label>
                <input className="input w-full" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">State *</label>
                <select className="input w-full" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">GSTIN *</label>
                <input className="input w-full font-mono" required value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Phone</label>
                <input className="input w-full" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email</label>
                <input className="input w-full" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Address</label>
                <textarea className="input w-full resize-none" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="col-span-2 flex gap-3">
                <button type="button" onClick={() => setEditFranchise(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Save Changes</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* STAFF TAB */}
      {activeTab === 'staff' && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Users size={16} className="text-brand-400" />
              Staff Members
            </div>
            <button onClick={() => setStaffModal(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors">
              <Plus size={13} /> Add Staff
            </button>
          </div>

          {loadingStaff ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : staff.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No staff yet.
              <button onClick={() => setStaffModal(false)} className="block mx-auto mt-2 text-brand-400 text-sm hover:underline">
                Add first staff member
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-dark-700/50">
                  <tr>
                    {['Name','Email','Phone','Role','Status','Actions'].map((h) => (
                      <th key={h} className="table-head">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s._id} className="table-row">
                      <td className="table-cell font-medium text-white">{s.name}</td>
                      <td className="table-cell text-gray-500 text-sm">{s.email}</td>
                      <td className="table-cell text-gray-500 text-sm">{s.phone || '—'}</td>
                      <td className="table-cell">
                        <span className={`badge ${ROLE_COLORS[s.role] || 'bg-gray-500/10 text-gray-400'}`}>
                          {ROLE_LABELS[s.role] || s.role}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className={`badge ${s.isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                          {s.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <button onClick={() => setStaffModal(s)} title="Edit"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleActive(s._id)} title={s.isActive ? 'Deactivate' : 'Activate'}
                          className={`p-1.5 rounded-lg transition-colors ml-1 ${s.isActive ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'}`}>
                          {s.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                        <button onClick={() => deleteStaff(s._id, s.name)} title="Delete"
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors ml-1">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Staff modal */}
      {staffModal !== null && (
        <StaffModal
          staff={staffModal || null}
          franchiseId={franchise._id}
          onClose={() => setStaffModal(null)}
          onSaved={() => { setStaffModal(null); loadStaff(); }}
        />
      )}

      {/* Payment Setup */}
      {paymentSetup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-dark-600">
              <h2 className="font-bold text-white text-lg">Payment Setup — {franchise.name}</h2>
              <button onClick={() => setPaymentSetup(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6">
              <FranchisePaymentSetup franchiseId={franchise._id} franchiseName={franchise.name} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Franchises Page ────────────────────────────────── */
export default function FranchisesPage() {
  const [franchises, setFranchises]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const [selected, setSelected]       = useState(null); // franchise detail view
  const [form, setForm] = useState({
    name:'', location:'', city:'', state:'Tamil Nadu', gstin:'', phone:'', email:'', address:'',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/franchises');
      setFranchises(res.data.franchises || []);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name:'', location:'', city:'', state:'Tamil Nadu', gstin:'', phone:'', email:'', address:'' });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/franchises/${editing._id}`, form); toast.success('Updated'); }
      else         { await api.post('/franchises', form); toast.success('Created'); }
      setShowModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const changeStatus = async (franchise, action) => {
    if (!window.confirm(`${action} this franchise?`)) return;
    try {
      const ep = action === 'archive'
        ? `/franchises/${franchise._id}/archive`
        : `/franchises/${franchise._id}/${action === 'restore' ? 'activate' : action}`;
      await api.patch(ep);
      toast.success(`Franchise ${action}d`);
      load();
    } catch (err) { toast.error(err.response?.data?.message || `Failed to ${action}`); }
  };

  const deleteFranchise = async (franchise) => {
    if (!window.confirm(`Permanently delete "${franchise.name}"?`)) return;
    try { await api.delete(`/franchises/${franchise._id}`); toast.success('Deleted'); load(); }
    catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  // If a franchise is selected → show detail view
  if (selected) {
    return (
      <FranchiseDetail
        franchise={selected}
        onBack={() => setSelected(null)}
        onRefresh={() => { load(); setSelected(null); }}
      />
    );
  }

  const activeFranchises   = franchises.filter((f) => getFranchiseStatus(f) !== 'archived');
  const archivedFranchises = franchises.filter((f) => getFranchiseStatus(f) === 'archived');

  const renderCard = (franchise, archived = false) => {
    const status     = getFranchiseStatus(franchise);
    const statusMeta = STATUS_META[status] || STATUS_META.inactive;
    return (
      <div key={franchise._id} className={`card-hover p-5 space-y-3 ${archived ? 'opacity-80' : ''}`}>
        {/* Clickable header → opens detail */}
        <button onClick={() => setSelected(franchise)} className="w-full text-left">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-500/15 rounded-xl flex items-center justify-center">
                <Building2 size={20} className="text-brand-400" />
              </div>
              <div>
                <div className="font-semibold text-white flex items-center gap-2">
                  {franchise.name}
                  {status !== 'active' && <Lock size={13} className="text-red-400" />}
                </div>
                <div className="text-xs font-mono text-brand-400">{franchise.franchiseCode}</div>
              </div>
            </div>
            <ChevronRight size={16} className="text-gray-500 mt-1" />
          </div>
          <div className="space-y-1.5 text-sm text-gray-500 mt-3">
            <div className="flex items-center gap-2"><MapPin size={13} />{franchise.city}, {franchise.state}</div>
            <div className="flex items-center gap-2"><FileText size={13} />GSTIN: <span className="font-mono text-gray-400">{franchise.gstin}</span></div>
            {franchise.owner_id && <div className="text-xs text-gray-600">Owner: {franchise.owner_id.name}</div>}
          </div>
        </button>

        <div className="flex items-center justify-between pt-1 border-t border-dark-700">
          <span className={`badge ${statusMeta.className}`}>{statusMeta.label}</span>
          <div className="flex gap-1">
            {archived ? (
              <button onClick={() => changeStatus(franchise, 'restore')}
                className="px-2 py-1 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20">
                Restore
              </button>
            ) : (
              <>
                {status === 'active'
                  ? <button onClick={() => changeStatus(franchise, 'deactivate')} className="px-2 py-1 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">Deactivate</button>
                  : <button onClick={() => changeStatus(franchise, 'activate')}   className="px-2 py-1 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20">Activate</button>
                }
                <button onClick={() => changeStatus(franchise, 'archive')} className="px-2 py-1 text-xs rounded-lg bg-dark-700 text-gray-400 hover:bg-dark-600">Archive</button>
                <button onClick={() => deleteFranchise(franchise)} className="px-2 py-1 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"><Trash2 size={12} /></button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Franchises</h1>
          <p className="text-gray-500 text-sm mt-1">
            {activeFranchises.length} active · {archivedFranchises.length} archived
            <span className="ml-2 text-gray-600">· Click a franchise to view details & staff</span>
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> New Franchise
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {loading
          ? <div className="col-span-full flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
          : activeFranchises.map((f) => renderCard(f))
        }
      </div>

      {!loading && archivedFranchises.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Archive size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Archived</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {archivedFranchises.map((f) => renderCard(f, true))}
          </div>
        </section>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-dark-600">
              <h2 className="font-display text-xl font-bold text-white">New Franchise</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Franchise Name *</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="label">City *</label><input className="input" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><label className="label">State *</label>
                <select className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className="label">Location / Area</label><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">GSTIN *</label><input className="input font-mono" required value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="27AABCU9603R1ZX" /></div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">Full Address</label><textarea className="input resize-none" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="col-span-2 flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
