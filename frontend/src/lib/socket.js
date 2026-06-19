import { io } from 'socket.io-client';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'https://utc-cafe.onrender.com')
  .replace(/\/api\/?$/, '').replace(/\/$/, '');

let socket = null;

// Track joined rooms to rejoin after reconnect
const joinedRooms = new Set();

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    joinedRooms.clear();
  }
};

const rejoinAllRooms = () => {
  if (joinedRooms.size === 0) return;
  console.log('[socket] rejoining rooms:', [...joinedRooms]);
  joinedRooms.forEach((room) => {
    const sep = room.indexOf('::');
    if (sep === -1) {
      socket.emit(room);
    } else {
      socket.emit(room.slice(0, sep), room.slice(sep + 2));
    }
  });
};

export const getSocket = () => {
  if (!socket) {
    socket = io(BACKEND_URL, {
      withCredentials: true,
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 30000,
    });

    // ── ROOT CAUSE FIX ──────────────────────────────────────────────────────
    // Socket.IO v4 does NOT emit 'reconnect' on the client side.
    // 'connect' fires on BOTH initial connection AND every reconnect.
    // The old code used 'reconnect' which never fired → rooms were never
    // rejoined after disconnect → order:ready events were silently dropped.
    socket.on('connect', () => {
      console.log('[socket] connected id:', socket.id, '| rooms to rejoin:', joinedRooms.size);
      rejoinAllRooms(); // no-op on first connect (joinedRooms empty)
    });

    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') {
        console.warn('[socket] disconnected:', reason);
      } else {
        console.log('[socket] closed manually');
      }
    });
  }
  return socket;
};

export const joinFranchiseRoom = (franchiseId) => {
  if (!franchiseId) return;
  const s = getSocket();
  s.emit('join:franchise', franchiseId);
  joinedRooms.add(`join:franchise::${franchiseId}`);
};

export const joinPOSRoom = (franchiseId) => {
  if (!franchiseId) return;
  const s = getSocket();
  s.emit('join:pos', franchiseId);
  s.emit('join:franchise', franchiseId);
  joinedRooms.add(`join:pos::${franchiseId}`);
  joinedRooms.add(`join:franchise::${franchiseId}`);
};

export const joinWaiterRoom = (franchiseId) => {
  if (!franchiseId) return;
  const s = getSocket();
  s.emit('join:waiter', franchiseId);
  s.emit('join:franchise', franchiseId);
  joinedRooms.add(`join:waiter::${franchiseId}`);
  joinedRooms.add(`join:franchise::${franchiseId}`);
};

export const joinDisplayRoom = (franchiseId) => {
  if (!franchiseId) return;
  const s = getSocket();
  s.emit('join:display', franchiseId);
  joinedRooms.add(`join:display::${franchiseId}`);
};

export const joinAdminRoom = () => {
  const s = getSocket();
  s.emit('join:admin');
  joinedRooms.add('join:admin');
};

export const joinTablesRoom = (franchiseId) => {
  if (!franchiseId) return;
  const s = getSocket();
  s.emit('join:tables', franchiseId);
  s.emit('join:franchise', franchiseId);
  joinedRooms.add(`join:tables::${franchiseId}`);
  joinedRooms.add(`join:franchise::${franchiseId}`);
};
