import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { ToggleLeft, ToggleRight, Search } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const CATEGORIES = ['All', 'Beverages', 'Snacks', 'Meals', 'Desserts', 'Breads', 'Specials', 'Add-ons'];
const STATUS_FILTERS = [
  { key: 'all',      label: 'All Items' },
  { key: 'active',   label: '✅ Active' },
  { key: 'oos',      label: '🔴 Out of Stock' },
  { key: 'disabled', label: '⛔ Disabled by Admin' },
];

export default function FranchiseMenuPage() {
  const { user } = useAuthStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toggling, setToggling] = useState(null);
  const searchTimer = useRef(null);

  const franchiseId = (user?.franchise_id?._id || user?.franchise_id)?.toString();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get('/menu/all');
    setItems(res.data.items);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // debounce search so filtering doesn't run on every keystroke
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(val), 250);
  };

  const isDisabled = useCallback((item) =>
    item.disabledInFranchises?.some((id) => id.toString() === franchiseId),
  [franchiseId]);

  const handleToggle = useCallback(async (item) => {
    setToggling(item._id);
    try {
      const res = await api.put(`/menu/${item._id}/toggle`);
      const enabled = res.data.isEnabled;
      toast.success(`${item.name} → ${enabled ? 'Available ✅' : '🔴 Out of Stock'}`);
      setStatusFilter(enabled ? 'active' : 'oos');
      load();
    } catch { toast.error('Toggle failed'); }
    setToggling(null);
  }, [load]);

  const getStatus = useCallback((item) => {
    if (!item.isGlobalActive) return 'disabled';
    if (isDisabled(item))     return 'oos';
    return 'active';
  }, [isDisabled]);

  // memoised — only recalculates when items/filters actually change
  const counts = useMemo(() => ({
    all:      items.length,
    active:   items.filter((i) => getStatus(i) === 'active').length,
    oos:      items.filter((i) => getStatus(i) === 'oos').length,
    disabled: items.filter((i) => getStatus(i) === 'disabled').length,
  }), [items, getStatus]);

  const filtered = useMemo(() => items.filter((i) => {
    const matchSearch = !debouncedSearch || i.name.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchCat    = catFilter === 'All' || i.category === catFilter;
    const matchStatus = statusFilter === 'all' || getStatus(i) === statusFilter;
    return matchSearch && matchCat && matchStatus;
  }), [items, debouncedSearch, catFilter, statusFilter, getStatus]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Menu Availability</h1>
          <p className="text-gray-500 text-sm mt-1">
            {counts.active} of {counts.all} items active for your outlet
          </p>
        </div>
      </div>

      <div className="card p-4 mb-6 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <ToggleRight size={16} className="text-brand-400" />
        </div>
        <div className="text-sm text-gray-400">
          Mark items as <span className="text-red-400 font-semibold">Out of Stock</span> to hide them from POS billing screen for{' '}
          <span className="text-white">{user?.franchise_id?.name}</span>.
          Items disabled by Master Admin cannot be re-enabled here.
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap mb-4">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              statusFilter === key
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'bg-dark-700 border-dark-500 text-gray-400 hover:text-white'
            }`}
          >
            {label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
              statusFilter === key ? 'bg-white/20' : 'bg-dark-600'
            }`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Category + Search filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-9 w-56"
            placeholder="Search..."
            value={search}
            onChange={handleSearchChange}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                catFilter === c ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:text-white'
              }`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">🍽️</div>
          <p className="text-gray-500 text-sm">No items match this filter</p>
          <button
            onClick={() => { setStatusFilter('all'); setCatFilter('All'); setSearch(''); }}
            className="mt-3 text-xs text-brand-400 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => {
            const status = getStatus(item);
            return (
              <div
                key={item._id}
                className={`card overflow-hidden transition-all duration-200 ${
                  status === 'disabled' ? 'opacity-40' :
                  status === 'oos'      ? 'opacity-60 border-red-500/20' :
                                          'border-dark-500 hover:border-brand-500/30'
                }`}
              >
                <div className="h-36 bg-dark-700 relative overflow-hidden">
                  {item.image?.url ? (
                    <img src={item.image.url} alt={item.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
                  )}
                  {status === 'disabled' && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <span className="text-xs text-gray-500">Disabled by Admin</span>
                    </div>
                  )}
                  {status === 'oos' && (
                    <div className="absolute inset-0 bg-red-900/40 flex items-center justify-center">
                      <span className="text-xs font-bold text-red-300 bg-red-900/80 px-2 py-1 rounded">🔴 Out of Stock</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white text-sm">{item.name}</span>
                    <span className="font-mono text-brand-400 text-sm">₹{item.price}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      <span className="badge bg-dark-600 text-gray-500 border-0 text-[10px]">{item.category}</span>
                      <span className="badge bg-dark-600 text-gray-600 border-0 text-[10px]">{item.gst_rate}%</span>
                    </div>
                    {status !== 'disabled' && (
                      <button
                        onClick={() => handleToggle(item)}
                        disabled={toggling === item._id}
                        className="flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50"
                      >
                        {toggling === item._id ? (
                          <div className="w-4 h-4 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                        ) : status === 'oos' ? (
                          <><ToggleLeft size={20} className="text-red-500" /><span className="text-red-400 font-semibold">Out of Stock</span></>
                        ) : (
                          <><ToggleRight size={20} className="text-green-400" /><span className="text-green-400 font-semibold">Available</span></>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
