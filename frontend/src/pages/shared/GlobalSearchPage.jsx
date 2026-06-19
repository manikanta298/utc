import { useState, useCallback, useRef } from 'react';
import {
  Search, X, ShoppingBag, Users, Clock, IndianRupee,
  ChevronRight, Phone, Mail, Star, AlertCircle,
} from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { format } from 'date-fns';

const STATUS_COLORS = {
  Paid:     'text-green-400 bg-green-400/10',
  Pending:  'text-yellow-400 bg-yellow-400/10',
  Refunded: 'text-red-400 bg-red-400/10',
};

const KITCHEN_COLORS = {
  Pending:   'text-yellow-400',
  Accepted:  'text-blue-400',
  Preparing: 'text-orange-400',
  Ready:     'text-green-400',
  Delivered: 'text-gray-400',
};

function OrderCard({ order, isMaster }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="bg-dark-700 border border-dark-600 rounded-xl p-4 hover:border-brand-500/40 transition-colors cursor-pointer"
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-mono text-sm font-semibold">{order.order_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.payment_status] || 'text-gray-400 bg-dark-600'}`}>
              {order.payment_status}
            </span>
            <span className={`text-xs font-medium ${KITCHEN_COLORS[order.kitchen_status] || 'text-gray-400'}`}>
              {order.kitchen_status}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400">
            {order.customer_id?.name && <span>👤 {order.customer_id.name}</span>}
            {order.customer_mobile && <span><Phone size={10} className="inline mr-0.5" />{order.customer_mobile}</span>}
            {order.table_number && <span>🪑 Table {order.table_number}</span>}
            {isMaster && order.franchise_id?.name && <span>🏪 {order.franchise_id.name}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-white font-semibold text-sm">₹{order.final_amount?.toLocaleString('en-IN')}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {order.createdAt ? format(new Date(order.createdAt), 'dd MMM, hh:mm a') : ''}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-dark-600 space-y-1">
          {order.items?.map((item, i) => (
            <div key={i} className="flex justify-between text-xs text-gray-400">
              <span>{item.name} × {item.quantity}</span>
              <span>₹{item.item_total?.toLocaleString('en-IN')}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-dark-600 mt-1">
            <span>Payment: {order.payment_mode}</span>
            <span>Type: {order.order_type}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerCard({ customer }) {
  return (
    <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 hover:border-brand-500/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-white font-semibold text-sm">{customer.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400">
            <span><Phone size={10} className="inline mr-0.5" />{customer.phone_no}</span>
            {customer.email && <span><Mail size={10} className="inline mr-0.5" />{customer.email}</span>}
            {customer.city && <span>📍 {customer.city}</span>}
          </div>
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          <div className="text-xs text-yellow-400 flex items-center gap-1 justify-end">
            <Star size={11} /> {customer.total_points || 0} pts
          </div>
          <div className="text-xs text-gray-400">{customer.total_orders || 0} orders</div>
          <div className="text-xs text-green-400">₹{(customer.total_spent || 0).toLocaleString('en-IN')}</div>
        </div>
      </div>
      {customer.last_visit && (
        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
          <Clock size={10} /> Last visit: {format(new Date(customer.last_visit), 'dd MMM yyyy')}
        </div>
      )}
    </div>
  );
}

export default function GlobalSearchPage() {
  const { user } = useAuthStore();
  const isMaster = user?.role === 'master_admin';

  const [query, setQuery]       = useState('');
  const [type, setType]         = useState('all');
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q, t) => {
    if (q.trim().length < 2) { setResults(null); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get(`/search?q=${encodeURIComponent(q)}&type=${t}`);
      setResults(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (val) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, type), 400);
  };

  const handleTypeChange = (t) => {
    setType(t);
    if (query.trim().length >= 2) doSearch(query, t);
  };

  const clear = () => { setQuery(''); setResults(null); setSearched(false); };

  const totalResults = (results?.orders?.length || 0) + (results?.customers?.length || 0);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Search size={22} className="text-brand-400" />
          Global Search
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Search orders and customers instantly</p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Order ID, customer name, mobile, table number…"
          className="w-full bg-dark-700 border border-dark-500 text-white placeholder-gray-500 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-brand-500 transition-colors"
        />
        {query && (
          <button onClick={clear} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Type filter */}
      <div className="flex gap-2">
        {[
          { id: 'all',       label: 'All' },
          { id: 'orders',    label: 'Orders' },
          { id: 'customers', label: 'Customers' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => handleTypeChange(t.id)}
            className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              type === t.id
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'border-dark-500 text-gray-400 hover:text-white hover:border-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && searched && totalResults === 0 && (
        <div className="flex flex-col items-center py-14 text-gray-500 gap-2">
          <AlertCircle size={32} className="text-dark-500" />
          <p className="text-sm">No results for <span className="text-white">"{query}"</span></p>
          <p className="text-xs">Try order number, customer name, or mobile number</p>
        </div>
      )}

      {/* Idle state */}
      {!loading && !searched && (
        <div className="flex flex-col items-center py-14 text-gray-500 gap-3">
          <Search size={40} className="text-dark-600" />
          <p className="text-sm">Type at least 2 characters to search</p>
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {['Order ID', 'Customer name', 'Mobile number', 'Table number', 'Bill number'].map((tip) => (
              <span key={tip} className="text-xs bg-dark-700 border border-dark-600 rounded-full px-3 py-1 text-gray-400">
                {tip}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && results && totalResults > 0 && (
        <div className="space-y-5">
          <p className="text-xs text-gray-500">{totalResults} result{totalResults !== 1 ? 's' : ''} for "{query}"</p>

          {/* Orders */}
          {results.orders?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <ShoppingBag size={13} />
                Orders ({results.orders.length})
              </div>
              {results.orders.map((order) => (
                <OrderCard key={order._id} order={order} isMaster={isMaster} />
              ))}
            </div>
          )}

          {/* Customers */}
          {results.customers?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <Users size={13} />
                Customers ({results.customers.length})
              </div>
              {results.customers.map((customer) => (
                <CustomerCard key={customer._id} customer={customer} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
