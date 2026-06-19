import { useEffect, useState } from 'react';
import { Download, IndianRupee, Filter } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';

const METHOD_COLORS = {
  Cash: 'text-green-400',
  UPI: 'text-blue-400',
  Card: 'text-purple-400',
  'Net Banking': 'text-yellow-400',
  Other: 'text-gray-300',
  Pending: 'text-red-400',
};

const REPORT_TYPES = [
  { value: 'all', label: 'All Payments Report' },
  { value: 'Cash', label: 'Cash Report' },
  { value: 'UPI', label: 'UPI Report' },
  { value: 'Card', label: 'Card Report' },
  { value: 'Net Banking', label: 'Net Banking Report' },
  { value: 'Other', label: 'Other Payments Report' },
];

export default function PaymentReportPage() {
  const { user } = useAuthStore();
  const isMasterAdmin = user?.role === 'master_admin';

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    franchiseId: '',
    paymentMethod: 'all',
  });

  const load = async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams(filters);

      const res = await api.get(`/reports/payments?${params}`);

      setRows(res.data.rows || []);
      setSummary(res.data.summary || {});
    } catch (error) {
      console.error(error);
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeReport =
    REPORT_TYPES.find(
      (report) => report.value === filters.paymentMethod
    )?.label || 'Payment Report';

  const downloadReport = async (formatType) => {
    try {
      const params = new URLSearchParams({
        ...filters,
        format: formatType,
      });

      const res = await api.get(
        `/reports/payments?${params}`,
        {
          responseType: 'blob',
        }
      );

      const url = URL.createObjectURL(res.data);

      const a = document.createElement('a');

      a.href = url;

      const ext =
        formatType === 'excel'
          ? 'xls'
          : formatType;

      const reportSlug = activeReport
        .toLowerCase()
        .replace(/\s+/g, '-');

      a.download = `${reportSlug}-${new Date()
        .toISOString()
        .split('T')[0]}.${ext}`;

      a.click();

      URL.revokeObjectURL(url);

      toast.success('Report downloaded successfully');
    } catch (error) {
      console.error(error);
      toast.error('Download failed');
    }
  };

  const summaryCards = [
    {
      label: 'Total',
      amount: summary.total || 0,
      color: 'text-white',
    },
    {
      label: 'Cash',
      amount: summary.Cash || 0,
      color: 'text-green-400',
    },
    {
      label: 'UPI',
      amount: summary.UPI || 0,
      color: 'text-blue-400',
    },
    {
      label: 'Card',
      amount: summary.Card || 0,
      color: 'text-purple-400',
    },
    {
      label: 'Net Banking',
      amount: summary['Net Banking'] || 0,
      color: 'text-yellow-400',
    },
    {
      label: 'Other',
      amount: summary.Other || 0,
      color: 'text-gray-300',
    },
    {
      label: 'Pending',
      amount: summary.Pending || 0,
      color: 'text-red-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <IndianRupee
              size={20}
              className="text-brand-400"
            />
            Payment Reports
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Unified report — all payment methods
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => downloadReport('csv')}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-xl"
          >
            <Download size={16} />
            CSV
          </button>

          <button
            onClick={() => downloadReport('excel')}
            className="btn-ghost flex items-center gap-2 text-sm px-4 py-2 rounded-xl"
          >
            <Download size={16} />
            Excel
          </button>

          <button
            onClick={() => downloadReport('pdf')}
            className="btn-ghost flex items-center gap-2 text-sm px-4 py-2 rounded-xl"
          >
            <Download size={16} />
            PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="card p-4"
          >
            <div className="text-xs text-gray-500 mb-1">
              {card.label}
            </div>

            <div
              className={`text-xl font-bold ${card.color}`}
            >
              ₹ {(card.amount || 0).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">
            Report Type
          </label>

          <select
            className="input"
            value={filters.paymentMethod}
            onChange={(e) =>
              setFilters({
                ...filters,
                paymentMethod: e.target.value,
              })
            }
          >
            {REPORT_TYPES.map((report) => (
              <option
                key={report.value}
                value={report.value}
              >
                {report.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">
            From Date
          </label>

          <input
            className="input"
            type="date"
            value={filters.startDate}
            onChange={(e) =>
              setFilters({
                ...filters,
                startDate: e.target.value,
              })
            }
          />
        </div>

        <div>
          <label className="label">
            To Date
          </label>

          <input
            className="input"
            type="date"
            value={filters.endDate}
            onChange={(e) =>
              setFilters({
                ...filters,
                endDate: e.target.value,
              })
            }
          />
        </div>

        <button
          onClick={load}
          className="btn-primary px-4 py-2 rounded-xl text-sm flex items-center gap-2"
        >
          <Filter size={14} />
          Apply
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600">
                {[
                  'Token/Ref',
                  'Franchise',
                  'Customer',
                  'Mobile',
                  'Method',
                  'Original',
                  'Discount',
                  'Paid',
                  'Status',
                  'Date',
                ].map((heading) => (
                  <th
                    key={heading}
                    className="text-left px-3 py-3 text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-dark-700">
              {rows.map((row, index) => (
                <tr
                  key={index}
                  className="hover:bg-dark-700/30 transition-colors"
                >
                  <td className="px-3 py-2 text-brand-400 font-mono text-xs whitespace-nowrap">
                    {row.tokenNumber ||
                      row.sessionRef}
                  </td>

                  <td className="px-3 py-2 text-gray-300 text-xs whitespace-nowrap">
                    {row.franchise}
                  </td>

                  <td className="px-3 py-2 text-gray-300 text-xs">
                    {row.customerName || '—'}
                  </td>

                  <td className="px-3 py-2 text-gray-400 text-xs">
                    {row.mobile}
                  </td>

                  <td className="px-3 py-2 text-xs">
                    <span
                      className={
                        METHOD_COLORS[
                          row.paymentType
                        ] || 'text-gray-400'
                      }
                    >
                      {row.paymentType}
                    </span>
                  </td>

                  <td className="px-3 py-2 text-gray-300 text-xs whitespace-nowrap">
                    ₹{' '}
                    {Number(
                      row.originalAmount || 0
                    ).toFixed(2)}
                  </td>

                  <td className="px-3 py-2 text-red-400 text-xs">
                    {row.discount > 0
                      ? `-₹ ${Number(
                          row.discount
                        ).toFixed(2)}`
                      : '—'}
                  </td>

                  <td className="px-3 py-2 text-green-400 font-semibold text-xs whitespace-nowrap">
                    ₹{' '}
                    {Number(
                      row.finalAmount || 0
                    ).toFixed(2)}
                  </td>

                  <td className="px-3 py-2 text-xs">
                    <span
                      className={
                        row.paymentStatus ===
                        'fully_paid'
                          ? 'text-green-400'
                          : row.paymentStatus ===
                            'unpaid'
                          ? 'text-red-400'
                          : 'text-yellow-400'
                      }
                    >
                      {row.paymentStatus?.replace(
                        '_',
                        ' '
                      )}
                    </span>
                  </td>

                  <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                    {row.date
                      ? format(
                          new Date(row.date),
                          'dd MMM HH:mm'
                        )
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading &&
            rows.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No payment records found
              </div>
            )}

          {loading && (
            <div className="text-center py-8 text-gray-500">
              Loading...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
