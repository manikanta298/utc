import { useEffect, useState } from 'react';
import { Search, Star, MapPin, User, Trash2, Download } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export function MasterCustomersPage() {
  const [customers, setCustomers]     = useState([]);
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(true);
  const [total, setTotal]             = useState(0);
  const [franchises, setFranchises]   = useState([]);
  const [franchiseId, setFranchiseId] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api.get(`/customers?search=${search}&limit=50`);
    setCustomers(res.data.customers);
    setTotal(res.data.total);
    setLoading(false);
  };

  // Load franchise list for the filter dropdown
  useEffect(() => {
    api.get('/franchises').then((res) => {
      setFranchises(res.data.franchises || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]);

  const deleteCustomer = async (id, name) => {
    if (!window.confirm(`Delete customer "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/customers/${id}`);
      toast.success('Customer deleted');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  const downloadCSV = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (franchiseId) params.set('franchiseId', franchiseId);
      const res = await api.get(`/customers/export.csv?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      const selectedFranchise = franchises.find((f) => f._id === franchiseId);
      const label = selectedFranchise ? `-${selectedFranchise.franchiseCode}` : '-all';
      a.href     = url;
      a.download = `customers${label}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Customers</h1>
          <p className="text-gray-500 text-sm mt-1">{total.toLocaleString()} total customers in the central history database</p>
        </div>
      </div>

      {/* Search + Download row */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-9 w-full" placeholder="Search by name, phone, or city..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Franchise filter for download */}
        <div className="flex items-end gap-2">
          <div>
            <label className="label">Download by Franchise</label>
            <select
              className="input"
              value={franchiseId}
              onChange={(e) => setFranchiseId(e.target.value)}
            >
              <option value="">All Franchises</option>
              {franchises.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name} ({f.franchiseCode})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={downloadCSV}
            disabled={downloading}
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
          >
            {downloading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Download size={14} />}
            {franchiseId ? 'Download Franchise CSV' : 'Download All CSV'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-dark-700/50">
            <tr>{['Phone', 'Customer', 'Location', 'Last Visit', 'Points', 'Visits', 'Total Spent', ''].map((heading) => <th key={heading} className="table-head">{heading}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-600">Loading...</td></tr>
            ) : customers.map((customer) => (
              <tr key={customer._id} className="table-row">
                <td className="table-cell font-mono text-brand-400">{customer.phone_no}</td>
                <td className="table-cell">
                  <div className="font-medium text-white">{customer.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <User size={11} />
                    {[customer.gender, customer.age ? `${customer.age} yrs` : ''].filter(Boolean).join(' · ') || 'Profile pending'}
                  </div>
                </td>
                <td className="table-cell text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-gray-600" />
                    <span>{[customer.city, customer.state].filter(Boolean).join(', ') || 'NA'}</span>
                  </div>
                </td>
                <td className="table-cell text-gray-600 text-xs">{customer.last_visit ? new Date(customer.last_visit).toLocaleDateString('en-IN') : 'NA'}</td>
                <td className="table-cell">
                  <div className="flex items-center gap-1.5">
                    <Star size={12} className="text-yellow-400" />
                    <span className="font-mono text-yellow-400">{customer.total_points}</span>
                    <span className="text-gray-600 text-xs">pts</span>
                  </div>
                </td>
                <td className="table-cell font-mono">{customer.total_orders}</td>
                <td className="table-cell font-mono text-green-400">Rs. {customer.total_spent?.toLocaleString('en-IN')}</td>
                <td className="table-cell">
                  <button onClick={() => deleteCustomer(customer._id, customer.name)}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default MasterCustomersPage;
