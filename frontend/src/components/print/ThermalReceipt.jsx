/**
 * ThermalReceipt — 20mm to 112mm thermal printer receipt
 * Supports Bluetooth thermal printers via window.print() (OS must have printer paired)
 * PDF download via @page CSS with exact paper width
 */
import { useRef, useState, useEffect } from 'react';
import { Printer, X, Download, Settings, QrCode } from 'lucide-react';

const fmt  = (n) => `₹${Number(n || 0).toFixed(2)}`;
const line = (cols) => '─'.repeat(cols);

const WIDTHS = [
  { label: '58mm', value: 58 },
  { label: '80mm', value: 80 },
  { label: '104mm', value: 104 },
];

export default function ThermalReceipt({ session, franchise, onClose, printerWidth: defaultWidth = 80 }) {
  const printRef = useRef();
  const [width, setWidth]         = useState(defaultWidth);
  const [showConfig, setShowConfig] = useState(false);
  const [upiQr, setUpiQr]         = useState(null);
  const [upiExpiry, setUpiExpiry] = useState(null);   // timestamp
  const [upiSecsLeft, setUpiSecsLeft] = useState(600); // 10 min countdown

  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  // Extract plain string ID — session.franchiseId may be a populated Mongoose object
  const franchiseId = (
    session?.franchiseId?._id ||
    session?.franchise_id?._id ||
    session?.franchiseId ||
    session?.franchise_id ||
    ''
  )?.toString();
  const amount      = session?.totalAmount || session?.total_amount || 0;
  const tokenNumber = session?.tokenNumber || '';
  const mobile      = session?.customerMobile || '';

  // Fetch UPI QR on mount
  useEffect(() => {
    if (!franchiseId || franchiseId === '[object Object]' || !amount) return;
    console.log('UPI QR Params', { franchiseId, amount, sessionId: session?._id, tokenNumber });
    const expiry = Date.now() + 10 * 60 * 1000;
    setUpiExpiry(expiry);
    fetch(`${API}/public/upi-qr/${franchiseId}?amount=${Number(amount).toFixed(2)}&sessionId=${session?._id || ''}&tokenNumber=${tokenNumber}&mobile=${mobile}`)
      .then(r => r.json())
      .then(data => { if (data.success && data.qr) setUpiQr(data); })
      .catch(() => {});
  }, [franchiseId, amount]);

  // 10-min countdown
  useEffect(() => {
    if (!upiExpiry) return;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((upiExpiry - Date.now()) / 1000));
      setUpiSecsLeft(left);
      if (left === 0) clearInterval(iv);
    }, 1000);
    return () => clearInterval(iv);
  }, [upiExpiry]);

  const upiExpired = upiSecsLeft === 0;
  const upiMins    = String(Math.floor(upiSecsLeft / 60)).padStart(2, '0');
  const upiSecs    = String(upiSecsLeft % 60).padStart(2, '0');

  const cols = width <= 58 ? 32 : width <= 80 ? 42 : 56;
  const px   = Math.round((width / 25.4) * 96); // mm → px at 96dpi
  const fs   = width <= 58 ? '10px' : '11px';

  const items    = session?.mergedItems || [];
  const payments = session?.payments    || [];
  const now      = new Date();

  function getCSS() {
    return `
      @page {
        size: ${width}mm auto;
        margin: 0;
      }
      @media print {
        html, body { margin: 0; padding: 0; background: #fff; }
        body * { visibility: hidden; }
        #thermal-print-area, #thermal-print-area * { visibility: visible; }
        #thermal-print-area {
          position: fixed; top: 0; left: 0;
          width: ${width}mm;
          font-family: 'Courier New', monospace;
          font-size: ${fs};
          color: #000;
          background: #fff;
          padding: 4px;
        }
      }
    `;
  }

  function handlePrint() {
    const style = document.createElement('style');
    style.id = 'thermal-css';
    style.textContent = getCSS();
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.getElementById('thermal-css')?.remove(), 1500);
  }

  function handleDownloadPDF() {
    const style = document.createElement('style');
    style.id = 'thermal-css';
    style.textContent = getCSS();
    document.head.appendChild(style);
    window.print(); // Browser "Save as PDF" option handles this
    setTimeout(() => document.getElementById('thermal-css')?.remove(), 1500);
  }

  const Row = ({ label, value, bold }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 'bold' : 'normal' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] flex flex-col">

        {/* Controls */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-800">Receipt</h3>
            <button onClick={() => setShowConfig(!showConfig)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <Settings size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-50">
              <Download size={13} /> PDF
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-700">
              <Printer size={13} /> Print ({width}mm)
            </button>
            {onClose && (
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Width selector */}
        {showConfig && (
          <div className="px-4 py-3 border-b bg-gray-50 flex flex-col gap-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Paper Width</div>
            <div className="flex gap-2 flex-wrap">
              {WIDTHS.map((w) => (
                <button key={w.value} onClick={() => setWidth(w.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    width === w.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}>
                  {w.label}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input type="number" min={20} max={112} value={width}
                  onChange={(e) => setWidth(Math.min(112, Math.max(20, Number(e.target.value))))}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-xs text-center font-mono" />
                <span className="text-xs text-gray-500">mm</span>
              </div>
            </div>
            <div className="text-[10px] text-gray-400">
              💡 Bluetooth printer: Pair via OS Settings → Printers. Then click Print and select it from the print dialog.
            </div>
          </div>
        )}

        {/* Receipt Preview */}
        <div className="overflow-y-auto flex-1 p-4 bg-gray-100">
          <div id="thermal-print-area" ref={printRef}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: fs,
              color: '#000',
              background: '#fff',
              padding: '6px',
              width: `${px}px`,
              margin: '0 auto',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '6px' }}>
              <div style={{ fontWeight: 'bold', fontSize: width <= 58 ? '13px' : '15px' }}>
                {franchise?.name || 'UTC Café'}
              </div>
              {franchise?.address && <div style={{ fontSize: '9px' }}>{franchise.address}</div>}
              {franchise?.gstin   && <div style={{ fontSize: '9px' }}>GSTIN: {franchise.gstin}</div>}
              {franchise?.phone   && <div style={{ fontSize: '9px' }}>Ph: {franchise.phone}</div>}
            </div>

            <div>{line(cols)}</div>

            {/* Order info */}
            <Row label="TOKEN"  value={session?.tokenNumber || '-'} />
            <Row label="Table"  value={session?.tableNumber || 'Counter'} />
            <Row label="Type"   value={session?.orderType === 'parcel' ? 'Parcel' : 'Dine-In'} />
            <Row label="Date"   value={`${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`} />
            {session?.customerName   && <Row label="Customer" value={session.customerName} />}
            {session?.customerMobile && <Row label="Mobile"   value={session.customerMobile} />}

            <div>{line(cols)}</div>

            {/* Items */}
            <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
              <span>Item</span><span>Amt</span>
            </div>
            <div>{line(cols)}</div>
            {items.map((item, i) => (
              <div key={i} style={{ marginBottom: '2px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.name}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', paddingLeft: '4px' }}>
                  <span>{item.qty || item.quantity} × {fmt(item.unitPrice || item.price)}</span>
                  <span>{fmt(item.totalPrice || (item.qty || item.quantity) * (item.unitPrice || item.price))}</span>
                </div>
              </div>
            ))}

            <div>{line(cols)}</div>

            {/* Totals */}
            <Row label="Subtotal" value={fmt(session?.subtotal || session?.sub_total)} />
            {(session?.cgst_amount || 0) > 0 && <Row label="CGST" value={fmt(session.cgst_amount)} />}
            {(session?.sgst_amount || 0) > 0 && <Row label="SGST" value={fmt(session.sgst_amount)} />}
            {(session?.discountAmount || 0) > 0 && (
              <Row label={`Discount${session.couponCode ? ` (${session.couponCode})` : ''}`}
                   value={`-${fmt(session.discountAmount)}`} />
            )}
            <div>{line(cols)}</div>
            <Row label="TOTAL" value={fmt(session?.totalAmount || session?.total_amount)} bold />
            <div>{line(cols)}</div>

            {/* Payments */}
            {payments.map((p, i) => (
              <Row key={i} label={`Paid (${p.method})`} value={fmt(p.amount)} />
            ))}
            {(session?.paidAmount || 0) > 0 && (
              <>
                <Row label="Total Paid" value={fmt(session.paidAmount)} />
                {(session?.totalAmount - session?.paidAmount) > 0.01 && (
                  <Row label="Balance Due"
                       value={fmt((session.totalAmount || 0) - (session.paidAmount || 0))} bold />
                )}
              </>
            )}

            {/* UPI Payment QR */}
            {upiQr && (
              <>
                <div>{line(cols)}</div>
                <div style={{ textAlign: 'center', margin: '6px 0 2px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '10px' }}>PAY VIA UPI</div>
                  {upiExpired ? (
                    <div style={{ color: 'red', fontSize: '9px', margin: '4px 0' }}>QR EXPIRED — Ask staff to reprint</div>
                  ) : (
                    <>
                      <img src={upiQr.qr} alt="UPI QR"
                        style={{ width: '90px', height: '90px', margin: '4px auto', display: 'block', border: '1px solid #eee' }} />
                      <div style={{ fontSize: '9px' }}>₹{Number(amount).toFixed(2)} · {upiQr.upiId}</div>
                      <div style={{ fontSize: '9px' }}>Valid: {upiMins}:{upiSecs}</div>
                      <div style={{ fontSize: '8px', color: '#666' }}>Token: {tokenNumber}{mobile ? ` · ${mobile}` : ''}</div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Footer */}
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '9px' }}>
              <div>Thank you for visiting!</div>
              <div>{franchise?.name || 'UTC Café'}</div>
              <div style={{ marginTop: '4px' }}>*** CUSTOMER COPY ***</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

