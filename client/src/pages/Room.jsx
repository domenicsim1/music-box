import { useState, useEffect, useRef, useCallback } from 'react';
import socket from '../socket';
import PaintCanvas, { emptyGrid } from '../components/PaintCanvas';
import { playBars, stopAll, downloadSong, previewNote, DRUM_ROW_LABELS } from '../audio/synthesis';

const ROLE_COLORS = { bass: '#6C63FF', lead: '#FF6B6B', melody: '#4ECDC4', drums: '#FF9F43' };
const ROLE_LABELS = { bass: '🎸 Bass', lead: '🎺 Lead', melody: '🎹 Melody', drums: '🥁 Drums' };

function PlayerList({ players, myId }) {
  return (
    <div className="player-list">
      <h4>Players</h4>
      {players.map(p => (
        <div key={p.id} className="player-item">
          <div className="player-dot" style={{ background: ROLE_COLORS[p.role] }} />
          <span className="player-name">{p.name}{p.id === myId ? ' (you)' : ''}</span>
          <span className="player-role" style={{ color: ROLE_COLORS[p.role] }}>{p.role}</span>
          {p.isHost && <span className="player-host">host</span>}
        </div>
      ))}
    </div>
  );
}

function Timer({ remaining, total }) {
  const pct = total > 0 ? Math.max(0, remaining / total) * 100 : 0;
  const urgent = remaining <= 10;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
  return (
    <div className="timer">
      <div className={`timer-display${urgent ? ' urgent' : ''}`}>{display}</div>
      <div className="timer-bar">
        <div className={`timer-fill${urgent ? ' urgent' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Lobby phase ──────────────────────────────────────────
function Lobby({ room, myPlayer, onStart, onConfigChange }) {
  const isHost = myPlayer?.isHost;
  return (
    <div className="lobby">
      <div className="lobby-share">
        <h3>Share this code</h3>
        <div className="lobby-code">{room.code}</div>
        <div className="lobby-hint">Others type this on the home screen to join</div>
      </div>

      {isHost && (
        <div className="lobby-config">
          <h3>Settings</h3>
          <div className="config-row">
            <div className="config-field">
              <label>Bars</label>
              <select
                value={room.config?.totalBars || 6}
                onChange={e => onConfigChange({ totalBars: Number(e.target.value) })}
              >
                {[2,3,4,6,8,12].map(n => <option key={n} value={n}>{n} bars</option>)}
              </select>
            </div>
            <div className="config-field">
              <label>Time per bar</label>
              <select
                value={room.config?.paintDuration || 60}
                onChange={e => onConfigChange({ paintDuration: Number(e.target.value) })}
              >
                <option value={30}>30 sec</option>
                <option value={45}>45 sec</option>
                <option value={60}>60 sec</option>
                <option value={90}>90 sec</option>
                <option value={120}>2 min</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {isHost
        ? <button className="btn-start" onClick={onStart}>Start Game</button>
        : <div className="waiting-msg">Waiting for the host to start…</div>
      }
    </div>
  );
}

// ── Painting phase ────────────────────────────────────────
function Painting({ myPlayer, myGrid, otherGrids, players, remaining, totalDuration, currentBar, totalBars, onGridChange, onDone, donePlayerIds }) {
  const color = ROLE_COLORS[myPlayer?.role] || '#6C63FF';
  const otherPlayers = players.filter(p => p.id !== myPlayer?.id);
  const myId = myPlayer?.id;
  const iDone = donePlayerIds.has(myId);
  const doneCount = donePlayerIds.size;
  const totalCount = players.length;

  const [previewing, setPreviewing] = useState(false);
  const previewCleanup = useRef(null);

  function handleListen() {
    if (previewing) {
      previewCleanup.current?.();
      previewCleanup.current = null;
      stopAll();
      setPreviewing(false);
      return;
    }
    const bar = { [myPlayer.id]: { grid: myGrid, role: myPlayer.role } };
    setPreviewing(true);
    const cleanup = playBars([bar], {
      onComplete: () => { setPreviewing(false); previewCleanup.current = null; },
    });
    previewCleanup.current = cleanup;
  }

  useEffect(() => () => { previewCleanup.current?.(); }, []);

  return (
    <>
      <div className="phase-header">
        <div>
          <div className="phase-title">Painting</div>
          <div className="bar-indicator">
            Bar {currentBar + 1} <span>of {totalBars}</span>
          </div>
        </div>
        <Timer remaining={remaining} total={totalDuration} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleListen}
            style={{
              background: previewing ? 'var(--border)' : 'var(--card)',
              color: previewing ? 'var(--lead)' : 'var(--muted)',
              border: `1.5px solid ${previewing ? 'var(--lead)' : 'var(--border)'}`,
              fontSize: 13, fontWeight: 600, padding: '5px 12px', borderRadius: 20,
            }}
          >
            {previewing ? '■ Stop' : '▶ Listen'}
          </button>
          <div
            className="role-badge"
            style={{ background: color + '22', color, border: `1.5px solid ${color}55` }}
          >
            {ROLE_LABELS[myPlayer?.role]}
          </div>
        </div>
      </div>

      <div className="canvas-section">
        <div className="canvas-label" style={{ justifyContent: 'space-between' }}>
          <div>
            <span style={{ color }}>Your canvas</span>
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}> click or drag to paint notes</span>
          </div>
          <button
            onClick={onDone}
            disabled={iDone}
            style={{
              background: iDone ? 'var(--border)' : color,
              color: iDone ? 'var(--muted)' : '#fff',
              fontSize: 13,
              fontWeight: 600,
              padding: '5px 14px',
              borderRadius: 20,
              transition: 'all 0.2s',
            }}
          >
            {iDone ? `Done ✓ (${doneCount}/${totalCount})` : 'Done'}
          </button>
        </div>
        <PaintCanvas
          color={color}
          grid={myGrid}
          editable={true}
          onGridChange={onGridChange}
          onNotePlay={(row) => previewNote(myPlayer?.role, row)}
          rowLabels={myPlayer?.role === 'drums' ? DRUM_ROW_LABELS : undefined}
        />
      </div>

      {otherPlayers.length > 0 && (
        <div className="canvas-section">
          <div className="canvas-label">Teammates</div>
          <div className="other-canvases">
            {otherPlayers.map(p => (
              <div key={p.id} className="other-canvas-wrap">
                <div className="canvas-label" style={{ color: ROLE_COLORS[p.role], fontSize: 11 }}>
                  {p.name} · {p.role}
                </div>
                <PaintCanvas
                  small
                  color={ROLE_COLORS[p.role]}
                  grid={otherGrids[p.id] || emptyGrid()}
                  editable={false}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Listening phase ───────────────────────────────────────
function Listening({ bars, currentBar, totalBars, players }) {
  const [progress, setProgress] = useState(0);
  const cleanupRef = useRef(null);

  useEffect(() => {
    setProgress(0);
    const cleanup = playBars(bars, {
      onProgress: p => setProgress(p),
    });
    cleanupRef.current = cleanup;
    return () => { cleanup && cleanup(); };
  }, [bars]);

  return (
    <div className="listening-view">
      <div className="listening-icon">🎵</div>
      <div>
        <div className="listening-title">Listen to your bar…</div>
        <div className="listening-subtitle">
          Bar {currentBar + 1} of {totalBars}
          {currentBar + 1 < totalBars && ' · next bar coming up'}
        </div>
      </div>

      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="listening-canvases">
        {Object.entries(bars[currentBar] || {}).map(([playerId, { grid, role }]) => {
          const hasNotes = grid.some(row => row.some(Boolean));
          if (!hasNotes) return null;
          const name = players.find(p => p.id === playerId)?.name || role;
          return (
            <div key={playerId} className="listening-canvas-col">
              <div className="canvas-label" style={{ color: ROLE_COLORS[role] }}>
                {name} <span style={{ color: 'var(--muted)' }}>{role}</span>
              </div>
              <PaintCanvas
                small
                color={ROLE_COLORS[role]}
                grid={grid}
                editable={false}
                rowLabels={role === 'drums' ? DRUM_ROW_LABELS : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Finished phase ────────────────────────────────────────
function Finished({ bars }) {
  const [playing, setPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const cleanupRef = useRef(null);

  function handleReplay() {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    setPlaying(true);
    const cleanup = playBars(bars, {
      onComplete: () => setPlaying(false),
    });
    cleanupRef.current = cleanup;
  }

  function handleStop() {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    stopAll();
    setPlaying(false);
  }

  function handleDownload() {
    if (downloading) return;
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    setPlaying(false);
    setDownloading(true);
    setDownloadProgress(0);
    downloadSong(bars, {
      onProgress: p => setDownloadProgress(p),
      onComplete: () => { setDownloading(false); setPlaying(false); },
    });
    setPlaying(true); // audio plays while recording
  }

  useEffect(() => {
    handleReplay();
    return () => { if (cleanupRef.current) cleanupRef.current(); };
  }, []);

  return (
    <div className="finished-view">
      <div className="finished-icon">🎉</div>
      <div className="finished-title">Your song is done!</div>
      <div className="finished-subtitle">{bars.length} bars of collaborative music</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {playing
          ? <button className="btn-replay" onClick={handleStop}>Stop</button>
          : <button className="btn-replay" onClick={handleReplay}>Play Again</button>
        }
        <button
          className="btn-replay"
          onClick={handleDownload}
          disabled={downloading}
          style={{ background: downloading ? 'var(--border)' : 'linear-gradient(135deg, var(--melody), var(--lead))', opacity: 1 }}
        >
          {downloading ? `Recording… ${Math.round(downloadProgress * 100)}%` : '⬇ Download'}
        </button>
      </div>

      {downloading && (
        <div className="progress-bar-wrap" style={{ maxWidth: 320 }}>
          <div className="progress-bar-fill" style={{ width: `${downloadProgress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

// ── Main Room component ───────────────────────────────────
export default function Room({ roomCode, player: initialPlayer, roomData: initialRoomData, onLeave }) {
  const [phase, setPhase] = useState(initialRoomData?.phase || 'lobby');
  const [players, setPlayers] = useState(initialRoomData?.players || []);
  const [config, setConfig] = useState(initialRoomData?.config || { totalBars: 6, paintDuration: 60 });
  const [currentBar, setCurrentBar] = useState(initialRoomData?.currentBar || 0);
  const [bars, setBars] = useState(initialRoomData?.bars || []);
  const [myPlayer, setMyPlayer] = useState(initialPlayer);
  const [remaining, setRemaining] = useState(config.paintDuration);
  const [myGrid, setMyGrid] = useState(emptyGrid());
  const [otherGrids, setOtherGrids] = useState({});
  const [donePlayerIds, setDonePlayerIds] = useState(new Set());

  // Debounced canvas emit
  const emitTimer = useRef(null);
  const pendingGrid = useRef(null);

  const sendGrid = useCallback((grid) => {
    pendingGrid.current = grid;
    clearTimeout(emitTimer.current);
    emitTimer.current = setTimeout(() => {
      socket.emit('canvas-update', { grid: pendingGrid.current });
    }, 80);
  }, []);

  const handleGridChange = useCallback((grid) => {
    setMyGrid(grid);
    sendGrid(grid);
  }, [sendGrid]);

  useEffect(() => {
    function onPhaseChange({ phase, currentBar, totalBars, duration, startingGrids, bars }) {
      setPhase(phase);
      if (currentBar != null) setCurrentBar(currentBar);
      if (bars) setBars(bars);
      if (phase === 'painting') {
        setRemaining(duration);
        setDonePlayerIds(new Set());
        // startingGrids is keyed by player ID
        const myId = myPlayer?.id;
        if (startingGrids && myId) {
          setMyGrid(startingGrids[myId] || emptyGrid());
          const others = {};
          for (const [id, grid] of Object.entries(startingGrids)) {
            if (id !== myId) others[id] = grid;
          }
          setOtherGrids(others);
        }
      }
    }

    function onTimerTick({ remaining }) {
      setRemaining(remaining);
    }

    function onCanvasUpdate({ playerId, grid }) {
      setOtherGrids(prev => ({ ...prev, [playerId]: grid }));
    }

    function onPlayerJoined({ player }) {
      setPlayers(prev => [...prev.filter(p => p.id !== player.id), player]);
    }

    function onPlayerLeft({ playerId, newHostId }) {
      setPlayers(prev => prev
        .filter(p => p.id !== playerId)
        .map(p => newHostId && p.id === newHostId ? { ...p, isHost: true } : p)
      );
      if (newHostId && newHostId === socket.id) {
        setMyPlayer(prev => ({ ...prev, isHost: true }));
      }
    }

    function onConfigUpdated({ config }) {
      setConfig(config);
    }

    function onPlayerDone({ playerId }) {
      setDonePlayerIds(prev => new Set([...prev, playerId]));
    }

    socket.on('phase-change', onPhaseChange);
    socket.on('timer-tick', onTimerTick);
    socket.on('canvas-update', onCanvasUpdate);
    socket.on('player-joined', onPlayerJoined);
    socket.on('player-left', onPlayerLeft);
    socket.on('config-updated', onConfigUpdated);
    socket.on('player-done', onPlayerDone);

    return () => {
      socket.off('phase-change', onPhaseChange);
      socket.off('timer-tick', onTimerTick);
      socket.off('canvas-update', onCanvasUpdate);
      socket.off('player-joined', onPlayerJoined);
      socket.off('player-left', onPlayerLeft);
      socket.off('config-updated', onConfigUpdated);
      socket.off('player-done', onPlayerDone);
    };
  }, [myPlayer?.id]);

  function handleStart() { socket.emit('start-game'); }
  function handleDone() { socket.emit('player-done'); }
  function handleConfigChange(update) {
    socket.emit('update-config', { ...update, roomCode });
  }

  const roomObj = { code: roomCode, config, hostId: players.find(p => p.isHost)?.id };

  return (
    <div className="room">
      <div className="room-header">
        <h2>MusicBox</h2>
        <div className="room-code-badge">Room <span>{roomCode}</span></div>
        <button
          onClick={onLeave}
          style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '4px 8px' }}
        >
          Leave
        </button>
      </div>

      <div className="room-body">
        <div className="room-main">
          {phase === 'lobby' && (
            <Lobby
              room={roomObj}
              myPlayer={myPlayer}
              onStart={handleStart}
              onConfigChange={handleConfigChange}
            />
          )}

          {phase === 'painting' && (
            <Painting
              myPlayer={myPlayer}
              myGrid={myGrid}
              otherGrids={otherGrids}
              players={players}
              remaining={remaining}
              totalDuration={config.paintDuration}
              currentBar={currentBar}
              totalBars={config.totalBars}
              onGridChange={handleGridChange}
              onDone={handleDone}
              donePlayerIds={donePlayerIds}
            />
          )}

          {phase === 'listening' && (
            <Listening
              bars={bars}
              currentBar={currentBar}
              totalBars={config.totalBars}
              players={players}
            />
          )}

          {phase === 'finished' && <Finished bars={bars} />}
        </div>

        <div className="room-sidebar">
          <PlayerList players={players} myId={myPlayer?.id} />

          {phase !== 'lobby' && phase !== 'finished' && (
            <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Song</div>
              {Array.from({ length: config.totalBars }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    padding: '3px 0',
                    color: i < currentBar ? 'var(--melody)' : i === currentBar ? 'var(--text)' : 'var(--muted)',
                    fontWeight: i === currentBar ? 600 : 400,
                  }}
                >
                  {i < currentBar ? '✓' : i === currentBar ? '▶' : '○'} Bar {i + 1}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
