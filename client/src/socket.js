import { io } from 'socket.io-client';

// Singleton — connects to the same origin, proxied to :3001 by Vite
const socket = io({ autoConnect: false });

export default socket;
