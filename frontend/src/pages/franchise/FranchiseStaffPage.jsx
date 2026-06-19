import { useEffect, useState } from 'react';
import {
  Plus, UserCheck, UserX, X, MapPin,
  Pencil, Trash2, KeyRound, Eye, EyeOff,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const STAFF_ROLES = ['manager', 'pos_staff', 'kitchen_staff', 'waiter'];
const ROLE_LABELS = {
  manager:       'Manager',
  pos_staff:     'Shift Operator',
  shift_operator:'Shift Operator',
  kitchen_staff: 'Kitchen Staff',
  waiter:        'Waiter',
};
const ROLE_COLORS = {
  manager:       'bg-teal-500/10 text-teal-400',
  pos_staff:     'bg-green-500/10 text-green-400',
  shift_operator:'bg-green-500/10 text-green-400',
  kitchen_staff: 'bg-orange-500/10 text-orange-400',
  waiter:        'bg-teal-500/10 text-teal-400',
};

export default function FranchiseStaffPage() {
  const [staff, setStaff]               = useState([]);
  const [loading, setLoading]           = useState(true);

  // Add modal
  const [showModal, setShowModal]       = useState(false);
  const [form, setForm]                 = useState({ name: '', email: '', password: '', role: 'pos_staff', phone: '' });

  // Edit modal
  const [editTarget, setEditTarget]     = useState(null);
  const [editForm, setEditForm]         = useState({ name: '', phone: '', role: '' });
  const [editSaving, setEditSaving]     = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);

  // Reset password modal
  const [resetTarget, setResetTarget]   = useState(null);
  const [newPassword, setNewPassword]   = useState('');
  const [showPwd, setShowPwd]           = useState(false);
  const [resetting, setResetting]       = useState(false);

  // Assign tables
  const [assignTarget, setAssignTarget] = useState(null);
  const [tableInput, setTableInput]     = useState('');
  const [assigning, setAssigning]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/staff');
      setStaff(res.data.staff || []);
    } catch { toast.error('Failed to load staff'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // ── Create ────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/create-staff', form);
      toast.success('Staff member added');
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'pos_staff', phone: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  // ── Edit ─────────────────────────────────────────────────
  const openEdit = (s) => {
    setEditTarget(s);
    setEditForm({ name: s.name, phone: s.phone || '', role: s.role });
  };

  const handleEdit = async () => {
    setEditSaving(true);
    try {
      await api.put(`/staff/${editTarget._id}`, editForm);
      toast.success('Details updated');
      setEditTarget(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed'); }
    finally { setEditSaving(false); }
  };

  // ── Delete ───────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/staff/${deleteTarget._id}`);
      toast.success(`${deleteTarget.name} permanently deleted`);
      setDeleteTarget(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
    finally { setDeleting(false); }
  };

  // ── Toggle Active ────────────────────────────────────────
  const toggleActive = async (id) => {
    try { await api.put(`/staff/${id}/toggle`); load(); }
    catch { toast.error('Failed'); }
  };

  // ── Reset Password ───────────────────────────────────────
  const handleResetPassword = async () => {
    setResetting(true);
    try {
      await api.patch(`/staff/${resetTarget._id}/reset-password`, { newPassword });
      toast.success('Password reset successfully');
      setResetTarget(null);
      setNewPassword('');
      setShowPwd(false);
    } catch (err) { toast.error(err.response?.data?.message || 'Reset failed'); }
    finally { setResetting(false); }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Team Management</h1>
          <p className="text-gray-500 text-sm mt-1">{staff.length} staff members</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Staff
        </button>
      </div>

      {/* ── Staff Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : staff.map((s) => (
          <div key={s._id} className={`card p-5 transition-all ${!s.isActive ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-dark-600 rounded-full flex items-center justify-center text-lg font-bold text-brand-400">
                {s.name[0].toUpperCase()}
              </div>
              <span className={`badge ${s.isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {s.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="font-semibold text-white mb-0.5">{s.name}</div>
            <div className="text-xs text-gray-500 mb-1">{s.email}</div>
            {s.phone && <div className="text-xs text-gray-600 mb-2">{s.phone}</div>}

            <div className="flex items-center justify-between mt-3">
              <span className={`badge ${ROLE_COLORS[s.role] || 'bg-gray-500/10 text-gray-400'}`}>
                {ROLE_LABELS[s.role] || s.role.replace('_', ' ')}
              </span>

              {/* Action buttons */}
              <div className="flex items-center gap-1">
                {/* Edit */}
                <button onClick={() => openEdit(s)}
                  className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors"
                  title="Edit details">
                  <Pencil size={14} />
                </button>

                {/* Reset Password */}
                <button onClick={() => { setResetTarget(s); setNewPassword(''); setShowPwd(false); }}
                  className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                  title="Reset password">
                  <KeyRound size={14} />
                </button>

                {/* Assign Tables (waiter only) */}
                {s.role === 'waiter' && (
                  <button onClick={() => { setAssignTarget(s); setTableInput((s.assigned_tables || []).join(', ')); }}
                    className="p-1.5 rounded-lg text-teal-400 hover:bg-teal-500/10 transition-colors"
                    title="Assign tables">
                    <MapPin size={14} />
                  </button>
                )}

                {/* Toggle Active */}
                <button onClick={() => toggleActive(s._id)}
                  className={`p-1.5 rounded-lg transition-colors ${s.isActive ? 'text-orange-400 hover:bg-orange-500/10' : 'text-green-400 hover:bg-green-500/10'}`}
                  title={s.isActive ? 'Deactivate' : 'Activate'}>
                  {s.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                </button>

                {/* Delete */}
                <button onClick={() => setDeleteTarget(s)}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete permanently">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {s.role === 'waiter' && s.assigned_tables?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {s.assigned_tables.map((t) => (
                  <span key={t} className="text-xs bg-teal-500/10 text-teal-400 border border-teal-500/30 rounded-full px-2 py-0.5">T{t}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Add Staff Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-dark-600">
              <h2 className="font-display text-xl font-bold text-white">Add Staff Member</h2>
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
                  {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
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

      {/* ── Edit Staff Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-dark-600">
              <div>
                <h2 className="font-bold text-white text-base flex items-center gap-2"><Pencil size={16} className="text-blue-400" /> Edit Staff</h2>
                <p className="text-xs text-gray-500 mt-0.5">{editTarget.email}</p>
              </div>
              <button onClick={() => setEditTarget(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                  {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditTarget(null)} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
                <button onClick={handleEdit} disabled={editSaving}
                  className="btn-primary flex-1 py-2 text-sm disabled:opacity-50">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-dark-600">
              <div>
                <h2 className="font-bold text-white text-base flex items-center gap-2"><KeyRound size={16} className="text-yellow-400" /> Reset Password</h2>
                <p className="text-xs text-gray-500 mt-0.5">{resetTarget.name} · {resetTarget.email}</p>
              </div>
              <button onClick={() => setResetTarget(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">New Password</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPwd ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                  />
                  <button type="button" onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setResetTarget(null)} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
                <button onClick={handleResetPassword} disabled={resetting || newPassword.length < 6}
                  className="flex-1 py-2 text-sm font-semibold bg-yellow-500 text-dark-900 rounded-xl hover:bg-yellow-400 disabled:opacity-40 transition-colors">
                  {resetting ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm animate-slide-up p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-red-500/10 rounded-full mx-auto mb-4">
              <Trash2 size={22} className="text-red-400" />
            </div>
            <h2 className="text-white font-bold text-center text-base mb-1">Delete Staff Member?</h2>
            <p className="text-gray-400 text-sm text-center mb-1">
              <span className="text-white font-semibold">{deleteTarget.name}</span> will be permanently removed.
            </p>
            <p className="text-xs text-red-400 text-center mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Tables Modal ── */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-dark-600">
              <div>
                <h2 className="font-bold text-white text-sm">Assign Tables</h2>
                <p className="text-xs text-gray-500 mt-0.5">{assignTarget.name}</p>
              </div>
              <button onClick={() => setAssignTarget(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Table Numbers (comma-separated)</label>
                <input type="text" value={tableInput}
                  onChange={(e) => setTableInput(e.target.value)}
                  placeholder="e.g. 1, 2, 5, 6" className="input w-full" />
                <p className="text-xs text-gray-600 mt-1">Leave empty to unassign all tables</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAssignTarget(null)} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
                <button disabled={assigning}
                  onClick={async () => {
                    setAssigning(true);
                    try {
                      const tables = tableInput.split(',').map((t) => t.trim()).filter(Boolean);
                      await api.put(`/waiter/${assignTarget._id}/assign-tables`, { tables });
                      toast.success('Tables assigned');
                      setAssignTarget(null);
                      load();
                    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
                    finally { setAssigning(false); }
                  }}
                  className="btn-primary flex-1 py-2 text-sm disabled:opacity-50">
                  {assigning ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
