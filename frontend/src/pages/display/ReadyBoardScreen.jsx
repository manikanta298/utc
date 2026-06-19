import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Clock3, MonitorSmartphone, RefreshCw, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { getSocket, joinDisplayRoom } from '../../lib/socket';

const sortByUpdatedAt = (items) => [...items].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

const TokenCard = ({ token, tone = 'brand' }) => {
  const toneMap = {
    brand: 'border-brand-500/30 bg-brand-500/10 text-brand-400',
    amber: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    slate: 'border-dark-500 bg-dark-700 text-gray-300',
  };

  return (
    <div className="rounded-2xl border border-dark-600 bg-dark-800 p-5 shadow-lg shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneMap[tone] || toneMap.brand}`}>
            {token.tokenLabel}
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{token.tableNumber ? `Table ${token.tableNumber}` : 'Counter Pickup'}</div>
          <div className="mt-2 text-sm text-gray-500">{token.customerName || 'Walk-in customer'}</div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>{token.orderCount || 0} order{token.orderCount === 1 ? '' : 's'}</div>
          <div className="mt-1">{token.readyCount || token.activeCount || token.deliveredCount || 0} live item group</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-dark-600 bg-dark-900/70 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-gray-600">Payment</div>
          <div className="mt-1 text-sm font-semibold text-white">{token.paymentStatus}</div>
        </div>
        <div className="rounded-xl border border-dark-600 bg-dark-900/70 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-gray-600">Collected</div>
          <div className="mt-1 text-sm font-semibold text-white">Rs. {Number(token.amountPaid || 0).toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-dark-600 bg-dark-900/70 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-gray-600">Outstanding</div>
          <div className="mt-1 text-sm font-semibold text-white">Rs. {Number(token.outstandingAmount || 0).toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
};

export default function ReadyBoardScreen() {
  const { user } = useAuthStore();
  const franchiseId = (user?.franchise_id?._id || user?.franchise_id)?.toString();
  const [loading, setLoading] = useState(true);
  const [readyNow, setReadyNow] = useState([]);
  const [inProgress, setInProgress] = useState([]);
  const [delivered, setDelivered] = useState([]);
  const announcedRef = useRef(new Set());

  const loadBoard = async () => {
    try {
      const res = await api.get('/token-sessions/ready-board');
      setReadyNow(sortByUpdatedAt(res.data.readyNow || []));
      setInProgress(sortByUpdatedAt(res.data.inProgress || []));
      setDelivered(sortByUpdatedAt(res.data.delivered || []));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load ready board');
    } finally {
      setLoading(false);
    }
  };

  const speakReadyToken = (token) => {
    if (!window.speechSynthesis || !token?.tokenLabel) return;
    if (announcedRef.current.has(token.sessionId)) return;
    announcedRef.current.add(token.sessionId);
    const message = new SpeechSynthesisUtterance(`${token.tokenLabel.replace('-', ' ')} is ready`);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(message);
  };

  useEffect(() => {
    loadBoard();
  }, []);

  useEffect(() => {
    if (!franchiseId) return undefined;
    joinDisplayRoom(franchiseId);
    const socket = getSocket();

    const handleReady = (token) => {
      speakReadyToken(token);
      setReadyNow((prev) => sortByUpdatedAt([{ ...token, readyCount: Math.max(token.readyCount || 0, 1) }, ...prev.filter((item) => item.sessionId !== token.sessionId)]));
      setInProgress((prev) => prev.filter((item) => item.sessionId !== token.sessionId));
      toast.success(`${token.tokenLabel} is ready`);
    };

    const handleUpdated = (token) => {
      if (token.kitchenStatus === 'Ready') {
        handleReady(token);
        return;
      }

      if (['Pending', 'Accepted', 'Preparing'].includes(token.kitchenStatus)) {
        setInProgress((prev) => sortByUpdatedAt([{ ...token }, ...prev.filter((item) => item.sessionId !== token.sessionId)]));
        setReadyNow((prev) => prev.filter((item) => item.sessionId !== token.sessionId));
        return;
      }

      setReadyNow((prev) => prev.map((item) => (item.sessionId === token.sessionId ? { ...item, ...token } : item)));
      setInProgress((prev) => prev.map((item) => (item.sessionId === token.sessionId ? { ...item, ...token } : item)));
    };

    const handleDelivered = (token) => {
      setReadyNow((prev) => prev.filter((item) => item.sessionId !== token.sessionId));
      setInProgress((prev) => prev.filter((item) => item.sessionId !== token.sessionId));
      setDelivered((prev) => sortByUpdatedAt([{ ...token, deliveredCount: 1 }, ...prev.filter((item) => item.sessionId !== token.sessionId)]).slice(0, 20));
    };

    socket.on('token:ready', handleReady);
    socket.on('token:updated', handleUpdated);
    socket.on('token:delivered', handleDelivered);
    return () => {
      socket.off('token:ready', handleReady);
      socket.off('token:updated', handleUpdated);
      socket.off('token:delivered', handleDelivered);
    };
  }, [franchiseId]);

  const summary = useMemo(() => ({
    ready: readyNow.length,
    progress: inProgress.length,
    delivered: delivered.length,
  }), [readyNow.length, inProgress.length, delivered.length]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="section-title">Live Ready Board</h1>
          <p className="mt-1 text-sm text-gray-500">Shows tokens that are preparing, ready for pickup, and recently delivered.</p>
        </div>
        <button onClick={loadBoard} className="btn-ghost flex items-center gap-2 px-4 py-2 text-sm">
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500"><BellRing size={14} className="text-brand-400" /> Ready Now</div>
          <div className="mt-2 text-3xl font-bold text-white">{summary.ready}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500"><Clock3 size={14} className="text-yellow-400" /> In Progress</div>
          <div className="mt-2 text-3xl font-bold text-white">{summary.progress}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500"><Sparkles size={14} className="text-green-400" /> Recently Delivered</div>
          <div className="mt-2 text-3xl font-bold text-white">{summary.delivered}</div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.1fr,1fr]">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <MonitorSmartphone size={16} className="text-brand-400" />
              Ready For Pickup
            </div>
            {readyNow.length ? readyNow.map((token) => <TokenCard key={token.sessionId} token={token} tone="brand" />) : (
              <div className="card px-6 py-12 text-center text-sm text-gray-600">No tokens are ready right now.</div>
            )}
          </section>

          <div className="space-y-6">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Clock3 size={16} className="text-yellow-400" />
                Preparing Queue
              </div>
              {inProgress.length ? inProgress.map((token) => <TokenCard key={token.sessionId} token={token} tone="amber" />) : (
                <div className="card px-6 py-10 text-center text-sm text-gray-600">Kitchen queue is currently clear.</div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles size={16} className="text-green-400" />
                Recently Delivered
              </div>
              {delivered.length ? delivered.map((token) => <TokenCard key={token.sessionId} token={token} tone="slate" />) : (
                <div className="card px-6 py-10 text-center text-sm text-gray-600">Delivered tokens will appear here.</div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
