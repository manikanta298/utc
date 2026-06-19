import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { getSocket, joinDisplayRoom } from '../../lib/socket';

const announceToken = (tokenNumber) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    `Token ${tokenNumber.replace('TOKEN-', '')} is ready. Please collect your order.`
  );
  utterance.lang = 'en-IN';
  utterance.rate = 0.85;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
};

export default function TokenDisplayBoard() {
  const { franchiseId } = useParams();
  const [searchParams] = useSearchParams();
  const tableParam = searchParams.get('table');
  const [readyTokens, setReadyTokens] = useState([]);
  const [recentlyAdded, setRecentlyAdded] = useState(new Set());
  const addedRef = useRef(new Set());

  useEffect(() => {
    if (!franchiseId) return;
    joinDisplayRoom(franchiseId);
    const socket = getSocket();

    const handleTokenAnnounce = ({ tokenNumber, tableNumber }) => {
      const token = { tokenNumber, tableNumber, addedAt: Date.now() };
      setReadyTokens((prev) => {
        const exists = prev.some((t) => t.tokenNumber === tokenNumber);
        return exists ? prev : [token, ...prev].slice(0, 20);
      });
      setRecentlyAdded((prev) => new Set([...prev, tokenNumber]));
      addedRef.current.add(tokenNumber);
      announceToken(tokenNumber);

      // Remove pulse after 4s
      setTimeout(() => {
        setRecentlyAdded((prev) => {
          const next = new Set(prev);
          next.delete(tokenNumber);
          return next;
        });
      }, 4000);

      // Auto-remove token after 3 minutes
      setTimeout(() => {
        setReadyTokens((prev) => prev.filter((t) => t.tokenNumber !== tokenNumber));
      }, 3 * 60 * 1000);
    };

    socket.on('token:announce', handleTokenAnnounce);
    return () => socket.off('token:announce', handleTokenAnnounce);
  }, [franchiseId]);

  // QR table scan → redirect to customer menu
  if (tableParam) return <Navigate to={`/menu/${franchiseId}?table=${tableParam}`} replace />;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-orange-500 px-8 py-5 flex items-center justify-between">
        <div className="text-3xl font-black tracking-wide">🍵 UTC CAFE</div>
        <div className="text-xl font-bold opacity-90">ORDER READY DISPLAY</div>
        <div className="text-lg opacity-80">
          {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div className="flex-1 p-8">
        {readyTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 opacity-30">
            <div className="text-8xl">⏳</div>
            <div className="text-3xl font-bold text-gray-400">Waiting for orders...</div>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="inline-block bg-green-500/20 border border-green-500/40 rounded-2xl px-8 py-3">
                <span className="text-green-400 text-2xl font-bold tracking-widest">✅ READY FOR COLLECTION</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {readyTokens.map((t) => (
                <div
                  key={t.tokenNumber}
                  className={[
                    'rounded-2xl border-2 p-6 flex flex-col items-center gap-3 transition-all duration-500',
                    recentlyAdded.has(t.tokenNumber)
                      ? 'bg-green-500/30 border-green-400 scale-105 shadow-[0_0_40px_rgba(74,222,128,0.4)]'
                      : 'bg-dark-800 border-gray-700',
                  ].join(' ')}
                >
                  <div className="text-5xl font-black text-white tracking-tight">
                    {t.tokenNumber.replace('TOKEN-', '')}
                  </div>
                  <div className="text-lg text-gray-400 font-medium">{t.tableNumber || 'Counter'}</div>
                  {recentlyAdded.has(t.tokenNumber) && (
                    <div className="text-green-400 text-sm font-bold animate-pulse">COLLECT NOW</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="bg-gray-900 px-8 py-4 text-center text-gray-500 text-sm">
        Token number will be removed automatically after collection • Please proceed to counter
      </div>
    </div>
  );
}
