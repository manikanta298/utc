const Table = require('../models/Table');
const OrderSession = require('../models/OrderSession');
const crypto = require('crypto');

const QR_SECRET = process.env.QR_SECRET || 'utc-cafe-qr-secret-key';

const signTable = (franchiseId, tableNumber) =>
  crypto.createHmac('sha256', QR_SECRET).update(`${franchiseId}:${tableNumber}`).digest('hex');

// GET /api/tables
const getTables = async (req, res) => {
  try {
    const franchiseId = req.user.role === 'master_admin'
      ? req.query.franchiseId
      : (req.user.franchise_id?._id || req.user.franchise_id);

    const tables = await Table.find({ franchiseId, isActive: true })
      .populate('currentSessionId', 'tokenNumber status paidAmount totalAmount')
      .sort({ tableNumber: 1 });

    res.json({ success: true, tables });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Helper: build the correct menu URL for a table QR
const buildMenuUrl = (franchiseId, tableNumber) => {
  const origin = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${origin}/menu/${franchiseId}?table=${encodeURIComponent(tableNumber)}`;
};

// Helper: generate QR image from URL
const makeQR = async (url) => {
  try {
    const QRCode = require('qrcode');
    return await QRCode.toDataURL(url);
  } catch {
    return url; // fallback: store URL string
  }
};

// POST /api/tables
const createTable = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const { tableNumber, capacity, menuUrl } = req.body;

    const qrSecret = signTable(franchiseId, tableNumber);
    const qrUrl    = menuUrl || buildMenuUrl(franchiseId, tableNumber);
    const qrCode   = await makeQR(qrUrl);

    const table = await Table.create({
      franchiseId,
      tableNumber,
      capacity: capacity || 4,
      qrCode,
      qrSecret,
    });

    res.status(201).json({ success: true, table });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Table number already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/tables/:id
const deleteTable = async (req, res) => {
  try {
    const table = await Table.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    res.json({ success: true, message: 'Table removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/tables/map
const getTableMap = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const tables = await Table.find({ franchiseId, isActive: true })
      .populate({
        path: 'currentSessionId',
        select: 'tokenNumber status paidAmount totalAmount subOrders mergedItems customerName',
      })
      .sort({ tableNumber: 1 });

    res.json({ success: true, tables });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/tables/verify-qr
const verifyTableQR = async (req, res) => {
  try {
    const { franchiseId, tableNumber, sig } = req.body;
    const expected = signTable(franchiseId, tableNumber);
    if (sig !== expected) {
      return res.status(400).json({ success: false, message: 'Invalid QR code' });
    }
    const table = await Table.findOne({ franchiseId, tableNumber, isActive: true });
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    res.json({ success: true, table });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/tables/:id/generate-qr   — FIX: regenerate QR with correct /menu/ URL
const generateTableQR = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

    const franchiseId = table.franchiseId;
    const qrUrl  = buildMenuUrl(franchiseId, table.tableNumber);
    const qrCode = await makeQR(qrUrl);

    table.qrCode = qrCode;
    await table.save();

    res.json({ success: true, table, qrCode });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateTableStatus = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const { status } = req.body;
    const allowed = ['available', 'occupied', 'bill_pending', 'reserved', 'needs_cleaning', 'held'];
    if (!allowed.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    const table = await Table.findOneAndUpdate(
      { _id: req.params.id, franchiseId },
      { status },
      { new: true }
    );
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', {
        tableId: table._id, status, tokenNumber: null,
      });
    }
    res.json({ success: true, table });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/tables/merge  — merge table B's session into table A
// Body: { primaryTableId, secondaryTableId }
const mergeTables = async (req, res) => {
  try {
    const { primaryTableId, secondaryTableId } = req.body;
    if (!primaryTableId || !secondaryTableId || primaryTableId === secondaryTableId) {
      return res.status(400).json({ success: false, message: 'Provide two different table IDs' });
    }

    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;

    const [primary, secondary] = await Promise.all([
      Table.findOne({ _id: primaryTableId, franchiseId }),
      Table.findOne({ _id: secondaryTableId, franchiseId }),
    ]);
    if (!primary || !secondary) return res.status(404).json({ success: false, message: 'Table not found' });
    if (!primary.currentSessionId)  return res.status(400).json({ success: false, message: 'Primary table has no active session' });
    if (!secondary.currentSessionId) return res.status(400).json({ success: false, message: 'Secondary table has no active session' });

    const primarySession   = await OrderSession.findById(primary.currentSessionId);
    const secondarySession = await OrderSession.findById(secondary.currentSessionId);
    if (!primarySession || !secondarySession) return res.status(404).json({ success: false, message: 'Session not found' });

    // Merge secondary subOrders into primary
    primarySession.subOrders.push(...secondarySession.subOrders);

    // Recalculate totals
    const allItems = primarySession.subOrders.flatMap((s) => s.items || []);
    const subtotal = allItems.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
    primarySession.subtotal     = subtotal;
    primarySession.totalAmount  = subtotal; // simplified; taxes recalculated on bill
    primarySession.mergedItems  = allItems;
    primarySession.tableNumber  = `${primary.tableNumber}+${secondary.tableNumber}`;
    await primarySession.save();

    // Close secondary session
    secondarySession.status = 'closed';
    secondarySession.closedAt = new Date();
    await secondarySession.save();

    // Free secondary table
    await Table.findByIdAndUpdate(secondaryTableId, { status: 'available', currentSessionId: null });

    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', { tableId: secondary._id, status: 'available', tokenNumber: null });
      io.to(`franchise:${franchiseId}`).emit('table:merged', {
        primaryTableId, secondaryTableId,
        mergedTableNumber: primarySession.tableNumber,
      });
    }

    res.json({ success: true, message: `Tables ${primary.tableNumber} and ${secondary.tableNumber} merged`, session: primarySession });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/tables/switch  — move session from table A to empty table B
// Body: { fromTableId, toTableId }
const switchTable = async (req, res) => {
  try {
    const { fromTableId, toTableId } = req.body;
    if (!fromTableId || !toTableId || fromTableId === toTableId) {
      return res.status(400).json({ success: false, message: 'Provide two different table IDs' });
    }

    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;

    const [fromTable, toTable] = await Promise.all([
      Table.findOne({ _id: fromTableId, franchiseId }),
      Table.findOne({ _id: toTableId,   franchiseId }),
    ]);
    if (!fromTable || !toTable) return res.status(404).json({ success: false, message: 'Table not found' });
    if (!fromTable.currentSessionId)  return res.status(400).json({ success: false, message: 'Source table has no active session' });
    if (toTable.currentSessionId)     return res.status(400).json({ success: false, message: 'Destination table is already occupied' });

    const session = await OrderSession.findById(fromTable.currentSessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    // Update session table references
    session.tableId     = toTable._id;
    session.tableNumber = toTable.tableNumber;
    await session.save();

    // Update table statuses
    await Table.findByIdAndUpdate(fromTableId, { status: 'available', currentSessionId: null });
    await Table.findByIdAndUpdate(toTableId,   { status: 'occupied',  currentSessionId: session._id });

    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', { tableId: fromTable._id, status: 'available', tokenNumber: null });
      io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', { tableId: toTable._id, status: 'occupied', tokenNumber: session.tokenNumber });
      io.to(`franchise:${franchiseId}`).emit('table:switched', {
        fromTableId, toTableId,
        fromTableNumber: fromTable.tableNumber,
        toTableNumber:   toTable.tableNumber,
        tokenNumber:     session.tokenNumber,
      });
    }

    res.json({ success: true, message: `Session moved from Table ${fromTable.tableNumber} to Table ${toTable.tableNumber}`, session });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// GET /api/tables/summary — returns { total, available, occupied, billPending, other }
const getTableSummary = async (req, res) => {
  try {
    const franchiseId = req.user.role === 'master_admin'
      ? req.query.franchiseId
      : (req.user.franchise_id?._id || req.user.franchise_id);

    const tables = await Table.find({ franchiseId, isActive: true }).select('status');

    const summary = tables.reduce((acc, t) => {
      acc.total += 1;
      if (t.status === 'available') acc.available += 1;
      else if (t.status === 'occupied' || t.status === 'bill_pending') acc.occupied += 1;
      else acc.other += 1;
      return acc;
    }, { total: 0, available: 0, occupied: 0, other: 0 });

    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getTables, createTable, deleteTable, getTableMap, verifyTableQR, generateTableQR, updateTableStatus, mergeTables, switchTable, getTableSummary };
