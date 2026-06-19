import { useEffect, useState, useCallback } from 'react';
import { Users, RefreshCw, Plus, Trash2, QrCode, Download, X, Printer, ArrowLeftRight, GitMerge, LayoutDashboard } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { getSocket, joinFranchiseRoom, joinTablesRoom } from '../../lib/socket';

const STATUS_CONFIG = {
  available:     { label: 'Available',      border: 'border-green-500/50',  bg: 'bg-green-500/10',   text: 'text-green-400',   dot: 'bg-green-500' },
  occupied:      { label: 'Occupied',       border: 'border-red-500/50',    bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-500 animate-pulse' },
  bill_pending:  { label: 'Bill Due',       border: 'border-yellow-500/50', bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  dot: 'bg-yellow-500' },
  reserved:      { label: 'Reserved',       border: 'border-blue-500/50',   bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-500' },
  needs_cleaning:{ label: 'Needs Cleaning', border: 'border-red-600/70',    bg: 'bg-red-600/10',     text: 'text-red-400',     dot: 'bg-red-500 animate-pulse' },
  held:          { label: 'On Hold',        border: 'border-yellow-600/50', bg: 'bg-yellow-600/10',  text: 'text-yellow-300',  dot: 'bg-yellow-500 animate-pulse' },
};

function QRModal({ table, onClose, franchiseId }) {
  const [regen, setRegen] = useState(false);
  const [localQr, setLocalQr] = useState(table.qrCode);

  // Correct URL: /menu/:franchiseId?table=X
  const APP_ORIGIN = window.location.origin;
  const correctUrl = `${APP_ORIGIN}/menu/${franchiseId}?table=${table.tableNumber}`;

  const regenerate = async () => {
    setRegen(true);
    try {
      const res = await api.post(`/tables/${table._id}/generate-qr`, { menuUrl: correctUrl });
      const newQr = res.data?.qrCode || res.data?.table?.qrCode;
      if (newQr) { setLocalQr(newQr); toast.success('QR regenerated!'); }
      else toast('QR regenerated on server. Refresh table list.');
    } catch {
      toast.error('Could not regenerate. Ask your developer to update QR URL.');
    }
    setRegen(false);
  };

  const printQR = () => {
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Table ${table.tableNumber} QR</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;gap:12px}
      img{width:280px;height:280px;border:2px solid #eee;border-radius:12px;padding:8px}
      h2{margin:0;font-size:22px}p{margin:0;color:#666;font-size:14px}
      small{font-size:11px;color:#aaa;word-break:break-all;max-width:300px;text-align:center}</style></head>
      <body>
        <h2>UTC Cafe — Table ${table.tableNumber}</h2>
        <img src="${localQr}" alt="QR" />
        <p>Scan to order</p>
        <small>${correctUrl}</small>
      </body></html>`);
    win.document.close();
    win.print();
  };

  const downloadQR = () => {
    if (!localQr) return;
    const a = document.createElement('a');
    a.href = localQr;
    a.download = `table-${table.tableNumber}-qr.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-xs p-6 text-center space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Table {table.tableNumber} QR</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        {localQr ? (
          <img
            src={localQr}
            alt={`Table ${table.tableNumber} QR Code`}
            className="w-56 h-56 mx-auto rounded-xl border border-dark-600 bg-white p-2"
          />
        ) : (
          <div className="w-56 h-56 mx-auto rounded-xl border border-dark-600 bg-dark-700 flex flex-col items-center justify-center gap-2">
            <QrCode size={40} className="text-gray-600" />
            <div className="text-xs text-gray-600">QR not generated yet</div>
          </div>
        )}
        <div className="text-xs text-gray-500">Scan → Customer Menu (not kitchen display)</div>
        <div className="text-[10px] text-gray-600 break-all bg-dark-800 rounded-lg p-2 font-mono">{correctUrl}</div>
        <button
          onClick={regenerate}
          disabled={regen}
          className="w-full btn-ghost flex items-center justify-center gap-2 py-2 rounded-xl text-xs text-brand-400"
        >
          <QrCode size={12} /> {regen ? 'Regenerating...' : 'Regenerate QR with correct URL'}
        </button>
        <div className="flex gap-2">
          <button onClick={printQR} className="flex-1 btn-ghost flex items-center justify-center gap-2 py-2 rounded-xl text-sm">
            <Printer size={14} /> Print
          </button>
          <button onClick={downloadQR} disabled={!localQr} className="flex-1 btn-primary flex items-center justify-center gap-2 py-2 rounded-xl text-sm">
            <Download size={14} /> Download
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TableMapPage({ onTableSelect, selectionMode = false, customerMobile = '' }) {
  const { user } = useAuthStore();
  const franchiseId = ((user?.franchise_id?._id || user?.franchise_id)?.toString() || '').trim().replace(/\s+/g, '');
  const canAdmin = ['franchise_owner', 'manager', 'master_admin', 'pos_staff', 'shift_operator'].includes(user?.role);
  const canEdit  = canAdmin || user?.role === 'waiter';

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTable, setNewTable] = useState({ tableNumber: '', capacity: 4 });
  const [adding, setAdding] = useState(false);
  const [qrTable, setQrTable] = useState(null);
  const [editTable, setEditTable] = useState(null); // manual status override
  // ── Merge / Switch ───────────────────────────────────────
  const [mergeSource, setMergeSource]   = useState(null); // table to merge FROM
  const [switchSource, setSwitchSource] = useState(null); // table to switch FROM
  const [actionLoading, setActionLoading] = useState(false);
  const [showSuggestions, setShowSuggestions]   = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/tables/map');
      setTables(res.data.tables || []);
    } catch { toast.error('Failed to load tables'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Smart free-table suggestions: available, sorted by capacity then number
  const freeTables = tables
    .filter((t) => t.status === 'available')
    .sort((a, b) => a.capacity - b.capacity || a.tableNumber - b.tableNumber);

  const suggestedTable = freeTables[0] || null;

  useEffect(() => {
    if (!franchiseId) return;
    joinFranchiseRoom(franchiseId);
    joinTablesRoom(franchiseId);
    const socket = getSocket();

    const handleTableUpdate = ({ tableId, status, tokenNumber, sessionCleared }) => {
      setTables((prev) => prev.map((t) => {
        if (t._id !== tableId) return t;
        // If session cleared (paid), remove session reference entirely
        if (sessionCleared || (!tokenNumber && status !== 'occupied' && status !== 'bill_pending')) {
          return { ...t, status, currentSessionId: null };
        }
        // If token provided, update/preserve session display info
        return {
          ...t,
          status,
          currentSessionId: tokenNumber
            ? { ...(t.currentSessionId || {}), tokenNumber }
            : t.currentSessionId,
        };
      }));
    };

    const handleSessionStarted = () => load(); // full reload when new session starts
    const handleSessionClosed = () => load();  // full reload when session closes
    const handleMerge = () => load();

    socket.on('table:statusUpdated', handleTableUpdate);
    socket.on('session:started', handleSessionStarted);
    socket.on('session:closed', handleSessionClosed);
    socket.on('table:merged', handleMerge);
    socket.on('table:switched', handleMerge);

    return () => {
      socket.off('table:statusUpdated', handleTableUpdate);
      socket.off('session:started', handleSessionStarted);
      socket.off('session:closed', handleSessionClosed);
      socket.off('table:merged', handleMerge);
      socket.off('table:switched', handleMerge);
    };
  }, [franchiseId, load]);

  const addTable = async () => {
    if (!newTable.tableNumber.trim()) return toast.error('Table number required');
    setAdding(true);
    try {
      const menuUrl = `${window.location.origin}/menu/${franchiseId}?table=${encodeURIComponent(newTable.tableNumber)}`;
      await api.post('/tables', { ...newTable, menuUrl });
      toast.success(`Table ${newTable.tableNumber} added`);
      setNewTable({ tableNumber: '', capacity: 4 });
      setShowAdd(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add table');
    } finally { setAdding(false); }
  };

  const removeTable = async (id, num) => {
    if (!window.confirm(`Remove Table ${num}?`)) return;
    try {
      await api.delete(`/tables/${id}`);
      toast.success(`Table ${num} removed`);
      load();
    } catch { toast.error('Failed to remove table'); }
  };

  const updateTableStatus = async (id, status, label) => {
    try {
      await api.patch(`/tables/${id}/status`, { status });
      toast.success(`Table marked as ${label}`);
      load();
    } catch (err) {
      // fallback — try PUT
      try {
        await api.put(`/tables/${id}`, { status });
        toast.success(`Table marked as ${label}`);
        load();
      } catch {
        toast.error('Failed to update table status');
      }
    }
  };

  // Merge: click occupied table → set as source → click another occupied table → merge
  const handleTableClick = (t) => {
    if (selectionMode) { onTableSelect?.(t); return; }

    if (mergeSource) {
      if (t._id === mergeSource._id) { setMergeSource(null); return; }
      if (!t.currentSessionId) { toast.error('Target table must have an active session to merge'); return; }
      doMerge(mergeSource, t);
      return;
    }
    if (switchSource) {
      if (t._id === switchSource._id) { setSwitchSource(null); return; }
      if (t.status !== 'available') { toast.error('Target table must be available for switching'); return; }
      doSwitch(switchSource, t);
      return;
    }
  };

  const doMerge = async (primary, secondary) => {
    if (!window.confirm(`Merge Table ${secondary.tableNumber} into Table ${primary.tableNumber}? Table ${secondary.tableNumber} will be freed.`)) {
      setMergeSource(null); return;
    }
    setActionLoading(true);
    try {
      await api.post('/tables/merge', { primaryTableId: primary._id, secondaryTableId: secondary._id });
      toast.success(`Tables ${primary.tableNumber} & ${secondary.tableNumber} merged`);
      setMergeSource(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Merge failed');
    } finally { setActionLoading(false); }
  };

  const doSwitch = async (from, to) => {
    if (!window.confirm(`Move session from Table ${from.tableNumber} to Table ${to.tableNumber}?`)) {
      setSwitchSource(null); return;
    }
    setActionLoading(true);
    try {
      await api.post('/tables/switch', { fromTableId: from._id, toTableId: to._id });
      toast.success(`Session moved to Table ${to.tableNumber}`);
      setSwitchSource(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Switch failed');
    } finally { setActionLoading(false); }
  };

  const counts = tables.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            {selectionMode ? 'Select a Table' : 'Table Map'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {selectionMode ? 'Choose an available table for this customer' : 'Live table status — real-time updates'}
          </p>
          {selectionMode && customerMobile && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-500/10 border border-brand-500/30">
              <span className="text-[10px] text-gray-400">Customer:</span>
              <span className="text-xs font-mono font-bold text-brand-400">{customerMobile}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-dark-700">
            <RefreshCw size={16} className={loading ? 'animate-spin text-brand-400' : ''} />
          </button>
          {selectionMode && freeTables.length > 0 && (
            <button onClick={() => setShowSuggestions((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 bg-brand-500/10 border border-brand-500/30 text-brand-400 rounded-xl text-sm hover:bg-brand-500/20">
              ✨ {freeTables.length} Free
            </button>
          )}
          {canAdmin && !selectionMode && (
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 text-sm px-3 py-2 rounded-xl">
              <Plus size={15} /> Add Table
            </button>
          )}
        </div>
      </div>

      {/* ── Smart Table Suggestion Banner ── */}
      {selectionMode && suggestedTable && (
        <div className="mb-4 p-4 bg-brand-500/10 border border-brand-500/30 rounded-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-brand-400 text-xs font-semibold uppercase tracking-wide mb-1">
                ✨ Suggested Table
              </div>
              <div className="text-white font-bold text-lg">Table {suggestedTable.tableNumber}</div>
              <div className="text-gray-400 text-xs mt-0.5">
                Capacity {suggestedTable.capacity} · Available now
              </div>
            </div>
            <button
              onClick={() => { onTableSelect?.(suggestedTable); }}
              className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-colors flex-shrink-0">
              Select →
            </button>
          </div>
          {freeTables.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-gray-500">Other free tables:</span>
              {freeTables.slice(1, 6).map((t) => (
                <button key={t._id} onClick={() => { onTableSelect?.(t); }}
                  className="px-2.5 py-1 bg-dark-700 border border-dark-600 text-gray-300 rounded-lg text-xs hover:border-brand-500 hover:text-white transition-colors">
                  T{t.tableNumber} ({t.capacity})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Merge / Switch active mode banner */}
      {(mergeSource || switchSource) && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
          mergeSource ? 'bg-purple-500/10 border-purple-500/40 text-purple-300' : 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
        }`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {mergeSource  ? <><GitMerge size={15} /> Merge mode — Table {mergeSource.tableNumber} selected. Tap another occupied table to merge into it.</> : null}
            {switchSource ? <><ArrowLeftRight size={15} /> Switch mode — Table {switchSource.tableNumber} selected. Tap an available table to move the session.</> : null}
          </div>
          <button onClick={() => { setMergeSource(null); setSwitchSource(null); }} className="p-1 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Table Summary Dashboard ───────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-dark-600 bg-dark-800 p-4 flex flex-col items-center justify-center gap-1 text-center">
          <LayoutDashboard size={18} className="text-brand-400 mb-1" />
          <div className="text-2xl font-black text-white">{tables.length}</div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Total Tables</div>
        </div>
        <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-4 flex flex-col items-center justify-center gap-1 text-center">
          <div className="w-3 h-3 rounded-full bg-green-500 mb-1" />
          <div className="text-2xl font-black text-green-400">{counts.available || 0}</div>
          <div className="text-[11px] font-semibold text-green-600 uppercase tracking-wide">Available</div>
        </div>
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 flex flex-col items-center justify-center gap-1 text-center">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse mb-1" />
          <div className="text-2xl font-black text-red-400">
            {(counts.occupied || 0) + (counts.bill_pending || 0)}
          </div>
          <div className="text-[11px] font-semibold text-red-600 uppercase tracking-wide">Occupied</div>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${cfg.border} ${cfg.bg}`}>
            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
            <span className="text-xs text-gray-500 font-mono">{counts[key] || 0}</span>
          </div>
        ))}
      </div>

      {/* Table grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-40 rounded-2xl bg-dark-700 animate-pulse" />)}
        </div>
      ) : tables.length === 0 ? (
        <div className="card p-14 text-center">
          <QrCode size={40} className="mx-auto text-gray-600 mb-3" />
          <div className="text-gray-400 mb-4">No tables configured yet</div>
          {canAdmin && (
            <button onClick={() => setShowAdd(true)} className="btn-primary px-5 py-2 text-sm rounded-xl">
              Add First Table
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {tables.map((t) => {
            const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.available;
            const isAvailable = t.status === 'available';
            const isOccupied  = t.status === 'occupied' || t.status === 'bill_pending';
            const clickable   = selectionMode && isAvailable;
            const isMergeSource  = mergeSource?._id === t._id;
            const isSwitchSource = switchSource?._id === t._id;
            const isActionTarget = (mergeSource && isOccupied && !isMergeSource) || (switchSource && isAvailable);

            return (
              <div
                key={t._id}
                onClick={() => handleTableClick(t)}
                className={[
                  'relative rounded-2xl border-2 p-3 flex flex-col gap-1.5 transition-all duration-200',
                  cfg.border, cfg.bg,
                  clickable || isActionTarget ? 'cursor-pointer hover:scale-105 ring-2 ring-brand-400/50' : '',
                  isMergeSource  ? 'ring-2 ring-purple-400 scale-105' : '',
                  isSwitchSource ? 'ring-2 ring-cyan-400 scale-105' : '',
                  !isAvailable && selectionMode ? 'opacity-40 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {/* Row 1: Table number + capacity */}
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-white leading-none">{t.tableNumber}</span>
                  <div className="flex items-center gap-1 text-gray-600 text-[10px]">
                    <Users size={10} />{t.capacity}
                  </div>
                </div>

                {/* Row 2: Status badge */}
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  <span className={`text-[11px] font-semibold truncate ${cfg.text}`}>{cfg.label}</span>
                </div>

                {/* Row 3: Token if occupied */}
                {t.currentSessionId?.tokenNumber && (
                  <div className="text-[10px] font-mono text-brand-400 leading-none">
                    {t.currentSessionId.tokenNumber}
                  </div>
                )}

                {/* Action hint during merge/switch mode */}
                {isMergeSource  && <div className="text-[10px] text-purple-300 font-bold text-center">Tap target to merge</div>}
                {isSwitchSource && <div className="text-[10px] text-cyan-300 font-bold text-center">Tap target table</div>}
                {isActionTarget && !isMergeSource && !isSwitchSource && (
                  <div className="text-[10px] text-brand-400 font-bold text-center animate-pulse">Tap to confirm</div>
                )}

                {/* Quick action buttons */}
                {!selectionMode && !mergeSource && !switchSource && canEdit && (
                  <div className="flex gap-1 mt-1">
                    {isOccupied && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); updateTableStatus(t._id, 'needs_cleaning', 'Needs Cleaning'); }}
                          className="flex-1 py-1 rounded-lg text-[10px] font-bold bg-red-500/20 border border-red-500/40 text-red-400">
                          🧹
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setMergeSource(t); setSwitchSource(null); }}
                          className="py-1 px-1.5 rounded-lg text-[10px] bg-purple-500/20 border border-purple-500/40 text-purple-400 hover:bg-purple-500/30"
                          title="Merge with another table">
                          <GitMerge size={11} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSwitchSource(t); setMergeSource(null); }}
                          className="py-1 px-1.5 rounded-lg text-[10px] bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30"
                          title="Switch to another table">
                          <ArrowLeftRight size={11} />
                        </button>
                      </>
                    )}
                    {t.status === 'needs_cleaning' && (
                      <button onClick={(e) => { e.stopPropagation(); updateTableStatus(t._id, 'available', 'Available'); }}
                        className="flex-1 py-1 rounded-lg text-[10px] font-bold bg-green-500/20 border border-green-500/40 text-green-400">
                        ✅ Ready
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setEditTable(t); }}
                      className="py-1 px-2 rounded-lg text-[10px] bg-dark-700 border border-dark-600 text-gray-400 hover:text-white"
                      title="Change status">
                      ✏️
                    </button>
                    {/* QR only for admins, not waiters */}
                    {canAdmin && !selectionMode && (
                      <button onClick={(e) => { e.stopPropagation(); setQrTable(t); }}
                        className="py-1 px-2 rounded-lg text-[10px] bg-dark-700 border border-dark-600 text-gray-400 hover:text-brand-400"
                        title="QR Code">
                        <QrCode size={11} />
                      </button>
                    )}
                  </div>
                )}

                {selectionMode && isAvailable && (
                  <div className="text-center text-[10px] text-green-400 font-bold mt-1">Tap to assign</div>
                )}

                {/* Remove button — admin roles only */}
                {canAdmin && !selectionMode && isAvailable && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeTable(t._id, t.tableNumber); }}
                    className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-dark-800/80 text-red-400 hover:bg-red-500/10 opacity-0 hover:opacity-100 transition-all"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Table Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Add Table</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div>
              <label className="label">Table Number / Name *</label>
              <input
                className="input"
                placeholder="e.g. 1, 2A, Window-1, VIP-1"
                value={newTable.tableNumber}
                onChange={(e) => setNewTable({ ...newTable, tableNumber: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addTable()}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Seating Capacity</label>
              <input
                className="input"
                type="number"
                min={1} max={30}
                value={newTable.capacity}
                onChange={(e) => setNewTable({ ...newTable, capacity: Number(e.target.value) })}
              />
              <p className="text-xs text-gray-600 mt-1">A QR code will be generated automatically for this table.</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowAdd(false)} className="flex-1 btn-ghost py-2.5 rounded-xl text-sm">
                Cancel
              </button>
              <button onClick={addTable} disabled={adding} className="flex-1 btn-primary py-2.5 rounded-xl text-sm">
                {adding ? 'Adding...' : 'Add Table + Generate QR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Status Edit Modal */}
      {editTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="card w-full max-w-xs p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Table {editTable.tableNumber}</h2>
              <button onClick={() => setEditTable(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-400">Manually override table status</p>
            <div className="space-y-2">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <button key={key}
                  onClick={async () => {
                    await updateTableStatus(editTable._id, key, cfg.label);
                    setEditTable(null);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all text-sm font-semibold
                    ${editTable.status === key
                      ? `${cfg.border} ${cfg.bg} ${cfg.text}`
                      : 'border-dark-600 text-gray-400 hover:border-dark-500 hover:text-white'}`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                  {editTable.status === key && <span className="ml-auto text-xs opacity-60">current</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrTable && <QRModal table={qrTable} onClose={() => setQrTable(null)} franchiseId={franchiseId} />}
    </div>
  );
}
