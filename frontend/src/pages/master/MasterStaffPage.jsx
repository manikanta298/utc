import { useEffect, useState } from 'react';
import { Plus, UserCheck, UserX, X, Trash2, ChevronDown, Building2, Users } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const ROLES = ['franchise_owner', 'manager', 'pos_staff', 'shift_operator', 'kitchen_staff', 'waiter'];
const ROLE_LABELS = {
  master_admin:    'Master Admin',
  franchise_owner: 'Franchise Owner',
  manager:         'Manager',
  pos_staff:       'POS Staff',
  shift_operator:  'Shift Operator',
  kitchen_staff:   'Kitchen Staff',
  waiter:          'Waiter',
};
const ROLE_COLORS = {
  master_admin:    'bg-purple-500/10 text-purple-400',
  franchise_owner: 'bg-blue-500/10 text-blue-400',
  manager:         'bg-teal-500/10 text-teal-400',
  pos_staff:       'bg-green-500/10 text-green-400',
  shift_operator:  'bg-green-500/10 text-green-400',
  kitchen_staff:   'bg-orange-500/10 text-orange-400',
  waiter:          'bg-yellow-500/10 text-yellow-400',
};

export function MasterStaffPage() {
  const [staff, setStaff]         = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [franchiseFilter, setFranchiseFilter] = useState('all');
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'pos_staff', phone: '', franchise_id: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [s, f] = await Promise.all([api.get('/staff'), api.get('/franchises')]);
      setStaff(s.data.staff || []);
      setFranchises(f.data.franchises || []);
    } catch { toast.error('Failed to load'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/create-staff', form);
      toast.success('Staff created');
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'pos_staff', phone: '', franchise_id: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const toggleActive = async (id) => {
    try { await api.put(`/staff/${id}/toggle`); toast.success('Status updated'); load(); }
    catch { toast.error('Failed'); }
  };

  const deleteStaff = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try { await api.delete(`/staff/${id}`); toast.success('Staff deleted'); load(); }
    catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  const toggleCollapse = (fid) =>
    setCollapsed((prev) => ({ ...prev, [fid]: !prev[fid] }));

  // Group staff by franchise
  const grouped = franchises
    .filter((f) => franchiseFilter === 'all' || f._id === franchiseFilter)
    .map((f) => ({
      franchise: f,
      members: staff.filter((s) => s.franchise_id?._id === f._id || s.franchise_id === f._id),
    }))
    .filter((g) => g.members.length > 0);

  const unassigned = staff.filter((s) => !s.franchise_id);

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">Staff Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            {staff.length} staff · {franchises.length} franchises
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Franchise filter */}
          <select
            value={franchiseFilter}
            onChange={(e) => setFranchiseFilter(e.target.value)}
            className="bg-dark-700 border border-dark-500 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500"
          >
            <option value="all">All Franchises</option>
            {franchises.map((f) => (
              <option key={f._id} value={f._id}>{f.name}</option>
            ))}
          </select>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Add Staff
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Franchise groups */}
          {grouped.map(({ franchise, members }) => {
            const isOpen = !collapsed[franchise._id];
            const activeCount = members.filter((m) => m.isActive).length;
            return (
              <div key={franchise._id} className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
                {/* Franchise header */}
                <button
                  onClick={() => toggleCollapse(franchise._id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-dark-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-brand-500/10 rounded-xl flex items-center justify-center">
                      <Building2 size={18} className="text-brand-400" />
                    </div>
                    <div className="text-left">
                      <div className="text-white font-semibold">{franchise.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Code: {franchise.franchiseCode} · {franchise.city || '—'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-sm text-gray-400">
                      <Users size={14} />
                      <span>{members.length} staff</span>
                      <span className="text-green-400 ml-1">({activeCount} active)</span>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Staff table */}
                {isOpen && (
                  <div className="border-t border-dark-700 overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-dark-700/50">
                        <tr>
                          {['Name', 'Email', 'Phone', 'Role', 'Status', 'Actions'].map((h) => (
                            <th key={h} className="table-head">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((s) => (
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
                              <button
                                onClick={() => toggleActive(s._id)}
                                className={`p-1.5 rounded-lg transition-colors ${s.isActive ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'}`}
                                title={s.isActive ? 'Deactivate' : 'Activate'}
                              >
                                {s.isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                              </button>
                              <button
                                onClick={() => deleteStaff(s._id, s.name)}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors ml-1"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned staff */}
          {unassigned.length > 0 && (
            <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-dark-700 flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-500/10 rounded-xl flex items-center justify-center">
                  <Users size={18} className="text-gray-400" />
                </div>
                <div>
                  <div className="text-white font-semibold">Unassigned</div>
                  <div className="text-xs text-gray-500">Not linked to any franchise</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-dark-700/50">
                    <tr>
                      {['Name', 'Email', 'Role', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="table-head">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unassigned.map((s) => (
                      <tr key={s._id} className="table-row">
                        <td className="table-cell font-medium text-white">{s.name}</td>
                        <td className="table-cell text-gray-500">{s.email}</td>
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
                          <button onClick={() => toggleActive(s._id)}
                            className={`p-1.5 rounded-lg transition-colors ${s.isActive ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'}`}>
                            {s.isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                          </button>
                          <button onClick={() => deleteStaff(s._id, s.name)}
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors ml-1">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {grouped.length === 0 && unassigned.length === 0 && (
            <div className="text-center py-20 text-gray-500">No staff found</div>
          )}
        </>
      )}

      {/* Add Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-dark-600">
              <h2 className="font-display text-xl font-bold text-white">Create Staff Account</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {[
                { label: 'Full Name', key: 'name', type: 'text' },
                { label: 'Email', key: 'email', type: 'email' },
                { label: 'Password', key: 'password', type: 'password' },
                { label: 'Phone', key: 'phone', type: 'tel' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input className="input" type={type} required={key !== 'phone'}
                    value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                </div>
              ))}
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Franchise</label>
                <select className="input" value={form.franchise_id} onChange={(e) => setForm({ ...form, franchise_id: e.target.value })}>
                  <option value="">Select franchise</option>
                  {franchises.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
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

export default MasterStaffPage;
