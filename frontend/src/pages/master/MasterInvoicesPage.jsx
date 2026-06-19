import { useEffect, useState } from 'react';
import { Download, Edit3, Printer, Trash2, X } from 'lucide-react';
import api from '../../lib/api';
import { format } from 'date-fns';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const PAYMENT_METHODS = ['all', 'Cash', 'UPI', 'Card', 'Net Banking', 'Other'];

export default function MasterInvoicesPage() {
  const { user } = useAuthStore();
  const [invoices, setInvoices] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ franchiseId: '', month: '', year: new Date().getFullYear(), paymentMethod: 'all' });
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ final_amount: '', payment_mode: 'Cash', discount_amount: '', reason: '' });
  const isMasterAdmin = user?.role === 'master_admin';

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 50, ...filters });
      const requests = [api.get(`/invoices?${params}`)];
      if (isMasterAdmin) requests.push(api.get('/franchises'));
      const [inv, fr] = await Promise.all(requests);
      setInvoices(inv.data.invoices);
      setTotal(inv.data.total);
      setFranchises(fr?.data?.franchises || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [filters, user?.role]);

  const downloadBlob = (data, type, filename) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const downloadReport = async (format = 'csv') => {
    const params = new URLSearchParams({ ...filters, format });
    const res = await api.get(`/invoices/export.csv?${params}`, { responseType: 'blob' });
    const ext = format === 'excel' ? 'xls' : format;
    downloadBlob(res.data, format === 'pdf' ? 'application/pdf' : 'text/csv', `gst-invoices.${ext}`);
  };
  const openReceipt = async (invoiceId) => {
    const res = await api.get(`/invoices/${invoiceId}/receipt`, { responseType: 'text' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const openEdit = (invoice) => {
    setEditing(invoice);
    setEditForm({
      final_amount: invoice.final_amount ?? '',
      payment_mode: invoice.payment_mode || 'Cash',
      discount_amount: invoice.discount_amount ?? 0,
      reason: '',
    });
  };
  const submitEdit = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/invoices/${editing._id}/financials`, {
        final_amount: Number(editForm.final_amount),
        payment_mode: editForm.payment_mode,
        discount_amount: Number(editForm.discount_amount || 0),
        reason: editForm.reason,
      });
      toast.success('Invoice updated and audit logged');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invoice update failed');
    }
  };
  const deleteInvoice = async (invoice) => {
    const reason = window.prompt(`Reason for deleting ${invoice.invoice_no}?`);
    if (reason === null) return;
    try {
      await api.delete(`/invoices/${invoice._id}`, { data: { reason } });
      toast.success('Invoice deleted and audit logged');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  // GST aggregate
  const gstTotals = invoices.reduce((acc, inv) => ({
    taxable:        acc.taxable        + (inv.taxable_amount || 0),
    cgst:           acc.cgst           + (inv.cgst || 0),
    sgst:           acc.sgst           + (inv.sgst || 0),
    igst:           acc.igst           + (inv.igst || 0),
    total:          acc.total          + (inv.total_tax || 0),
    final:          acc.final          + (inv.final_amount || 0),
    couponDiscount: acc.couponDiscount + (inv.coupon_discount || 0),
    totalDiscount:  acc.totalDiscount  + (inv.total_discount || inv.discount_amount || 0),
    couponCount:    acc.couponCount    + (inv.coupon_code ? 1 : 0),
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, final: 0, couponDiscount: 0, totalDiscount: 0, couponCount: 0 });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">{user?.role === 'master_admin' ? 'Invoices & GST Reports' : 'Franchise Reports'}</h1>
          <p className="text-gray-500 text-sm mt-1">{total} invoices</p>
        </div>
        {isMasterAdmin ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => downloadReport('csv')} className="btn-ghost flex items-center gap-2 py-2">
              <Download size={15} /> CSV
            </button>
            <button onClick={() => downloadReport('excel')} className="btn-ghost flex items-center gap-2 py-2">
              <Download size={15} /> Excel
            </button>
            <button onClick={() => downloadReport('pdf')} className="btn-ghost flex items-center gap-2 py-2">
              <Download size={15} /> PDF
            </button>
          </div>
        ) : null}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {user?.role === 'master_admin' && (
          <select className="input w-48" value={filters.franchiseId} onChange={(e) => setFilters({ ...filters, franchiseId: e.target.value })}>
            <option value="">All Franchises</option>
            {franchises.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
          </select>
        )}
        <select className="input w-36" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}>
          <option value="">All Months</option>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select className="input w-44" value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>{method === 'all' ? 'All Payments' : method}</option>
          ))}
        </select>
        <input className="input w-28" type="number" placeholder="Year" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} />
      </div>

      {/* GST Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Taxable',       value: gstTotals.taxable,        color: 'text-white' },
          { label: 'CGST',          value: gstTotals.cgst,           color: 'text-blue-400' },
          { label: 'SGST',          value: gstTotals.sgst,           color: 'text-teal-400' },
          { label: 'IGST',          value: gstTotals.igst,           color: 'text-purple-400' },
          { label: 'Total Tax',     value: gstTotals.total,          color: 'text-orange-400' },
          { label: 'Coupon Discount', value: gstTotals.couponDiscount, color: 'text-red-400' },
          { label: 'Total Discount',  value: gstTotals.totalDiscount,  color: 'text-red-400' },
          { label: 'Final Revenue', value: gstTotals.final,          color: 'text-green-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4">
            <div className="text-xs text-gray-600 mb-1">{label}</div>
            <div className={`font-mono font-bold text-sm ${color}`}>₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        ))}
      </div>

      {/* Invoice table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-700/50">
              <tr>{['Invoice No', 'Date', 'Franchise', 'Customer', 'Taxable', 'CGST', 'SGST', 'IGST', 'Tax', 'Coupon', 'Discount', 'Final', 'Visited As', 'Actions'].map(h => <th key={h} className="table-head">{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={11} className="text-center py-8 text-gray-600">Loading...</td></tr>
              : invoices.map((inv) => (
                <tr key={inv._id} className="table-row">
                  <td className="table-cell font-mono text-brand-400 text-xs">{inv.invoice_no}</td>
                  <td className="table-cell text-xs text-gray-500">{inv.invoice_date ? format(new Date(inv.invoice_date), 'dd/MM/yy') : ''}</td>
                  <td className="table-cell text-xs">{inv.franchise_id?.franchiseCode}</td>
                  <td className="table-cell text-xs">{inv.customer_name}</td>
                  <td className="table-cell font-mono text-xs">₹{inv.taxable_amount?.toFixed(2)}</td>
                  <td className="table-cell font-mono text-xs text-blue-400">₹{inv.cgst?.toFixed(2)}</td>
                  <td className="table-cell font-mono text-xs text-teal-400">₹{inv.sgst?.toFixed(2)}</td>
                  <td className="table-cell font-mono text-xs text-purple-400">₹{inv.igst?.toFixed(2)}</td>
                  <td className="table-cell font-mono text-xs text-orange-400">₹{inv.total_tax?.toFixed(2)}</td>
                  <td className="table-cell text-xs">
                    {inv.coupon_code
                      ? <span className="bg-brand-500/10 text-brand-400 border border-brand-500/20 px-2 py-0.5 rounded-full font-mono text-[10px]">{inv.coupon_code}</span>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="table-cell font-mono text-xs text-red-400">
                    {(inv.total_discount || inv.discount_amount || 0) > 0
                      ? <>-₹{(inv.total_discount || inv.discount_amount || 0).toFixed(2)}</>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="table-cell font-mono text-xs text-green-400 font-bold">₹{inv.final_amount?.toFixed(2)}</td>
                  <td className="table-cell">
                    <span className="badge text-xs bg-amber-500/10 text-amber-400 capitalize">
                      {inv.visit_type || '—'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openReceipt(inv._id)} className="text-gray-500 hover:text-brand-400 transition-colors" title="Print receipt">
                        <Printer size={15} />
                      </button>
                      {isMasterAdmin ? (
                        <>
                          <button onClick={() => openEdit(inv)} className="text-gray-500 hover:text-blue-400 transition-colors" title="Edit financials">
                            <Edit3 size={15} />
                          </button>
                          <button onClick={() => deleteInvoice(inv)} className="text-gray-500 hover:text-red-400 transition-colors" title="Delete invoice">
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between border-b border-dark-600 p-5">
              <div>
                <h2 className="font-semibold text-white">Correct Invoice</h2>
                <p className="text-xs text-gray-500">{editing.invoice_no}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={submitEdit} className="space-y-4 p-5">
              <div>
                <label className="label">Final Amount</label>
                <input className="input" type="number" step="0.01" min="0" required value={editForm.final_amount} onChange={(e) => setEditForm({ ...editForm, final_amount: e.target.value })} />
              </div>
              <div>
                <label className="label">Payment Method</label>
                <select className="input" value={editForm.payment_mode} onChange={(e) => setEditForm({ ...editForm, payment_mode: e.target.value })}>
                  {PAYMENT_METHODS.filter((method) => method !== 'all').map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Discount Amount</label>
                <input className="input" type="number" step="0.01" min="0" value={editForm.discount_amount} onChange={(e) => setEditForm({ ...editForm, discount_amount: e.target.value })} />
              </div>
              <div>
                <label className="label">Audit Reason</label>
                <textarea className="input resize-none" rows={3} required value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditing(null)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Save Correction</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
