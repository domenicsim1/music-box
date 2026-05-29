import { useState } from 'react';
import socket from '../socket';
import { initAudio } from '../audio/synthesis';

export default function Home({ onJoin }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) { setError('Enter your name first.'); return; }
    setError('');
    setLoading(true);
    await initAudio();
    if (!socket.connected) socket.connect();

    socket.once('room-created', ({ roomCode, player, room }) => {
      onJoin({ roomCode, player, roomData: room });
    });
    socket.once('error', ({ message }) => {
      setError(message);
      setLoading(false);
    });
    socket.emit('create-room', { playerName: name.trim() });
  }

  async function handleJoin() {
    if (!name.trim()) { setError('Enter your name first.'); return; }
    if (!code.trim()) { setError('Enter a room code.'); return; }
    setError('');
    setLoading(true);
    await initAudio();
    if (!socket.connected) socket.connect();

    socket.once('room-joined', ({ roomCode, player, room }) => {
      onJoin({ roomCode, player, roomData: room });
    });
    socket.once('error', ({ message }) => {
      setError(message);
      setLoading(false);
    });
    socket.emit('join-room', { playerName: name.trim(), roomCode: code.trim().toUpperCase() });
  }

  return (
    <div className="home">
      <div className="home-card">
        <div className="home-logo">
          <h1>Music<span>Box</span></h1>
          <p>Paint music together, no experience needed</p>
        </div>

        <div className="home-name">
          <label>Your Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Enter your name"
            maxLength={20}
            autoFocus
          />
        </div>

        <div className="home-actions" style={{ marginTop: 20 }}>
          <button className="btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Connecting…' : '+ Create Room'}
          </button>

          <div className="divider">or join</div>

          <div className="join-row">
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="ROOM CODE"
              maxLength={4}
              style={{ letterSpacing: '3px' }}
            />
            <button onClick={handleJoin} disabled={loading}>Join</button>
          </div>
        </div>

        {error && <div className="error-msg" style={{ marginTop: 16 }}>{error}</div>}
      </div>
    </div>
  );
}
