import { useEffect, useState } from 'react';
import { Shield, Search, Filter, Download } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const ACTION_COLORS = {
  FRANCHISE_ACTIVATED: 'text-green-400 bg-green-400/10',
  FRANCHISE_DEACTIVATED: 'text-red-400 bg-red-400/10',
  PAYMENT_EDITED: 'text-yellow-400 bg-yellow-400/10',
  PAYMENT_DELETED: 'text-red-400 bg-red-400/10',
  COUPON_CREATED: 'text-blue-400 bg-blue-400/10',
  COUPON_UPDATED: 'text-blue-400 bg-blue-400/10',
  COUPON_DELETED: 'text-red-400 bg-red-400/10',
  ORDER_EDITED: 'text-yellow-400 bg-yellow-400/10',
  PAYMENT_CONFIG_UPDATED: 'text-purple-400 bg-purple-400/10',
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ action: '', startDate: '', endDate: '' });

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 50, ...filters });
      const res = await api.get(`/audit?${params}`);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch { toast.error('Failed to load audit logs'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(page); }, [page]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield size={20} className="text-brand-400" /> Audit Logs
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total records</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Action Type</label>
          <input className="input w-48" placeholder="e.g. PAYMENT_EDITED"
            value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} />
        </div>
        <div>
          <label className="label">From Date</label>
          <input className="input" type="date" value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
        </div>
        <div>
          <label className="label">To Date</label>
          <input className="input" type="date" value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
        </div>
        <button onClick={() => { setPage(1); load(1); }} className="btn-primary px-4 py-2 rounded-xl text-sm flex items-center gap-2">
          <Filter size={14} /> Filter
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-12 animate-pulse bg-dark-700" />)}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-600">
                  {['Timestamp', 'Action', 'Performed By', 'Franchise', 'Details'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {logs.map((log) => (
                  <tr key={log._id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                      {log.timestamp ? format(new Date(log.timestamp), 'dd MMM yy HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] || 'text-gray-400 bg-gray-400/10'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white text-xs font-medium">{log.performedByName || log.performedBy?.name || '—'}</div>
                      <div className="text-gray-600 text-xs">{log.performedByRole}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{log.franchiseName || log.franchiseId?.name || 'Master'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                      {JSON.stringify(log.details).slice(0, 80)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && (
              <div className="text-center py-12 text-gray-500">No audit logs found</div>
            )}
          </div>
        </div>
      )}

      {total > 50 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost px-4 py-2 rounded-xl text-sm">Previous</button>
          <span className="text-gray-400 py-2 px-3">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= total} className="btn-ghost px-4 py-2 rounded-xl text-sm">Next</button>
        </div>
      )}
    </div>
  );
}
