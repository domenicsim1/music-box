import { useState } from 'react';
import Home from './pages/Home';
import Room from './pages/Room';

export default function App() {
  const [scene, setScene] = useState({ page: 'home' });

  if (scene.page === 'room') {
    return (
      <Room
        roomCode={scene.roomCode}
        player={scene.player}
        roomData={scene.roomData}
        onLeave={() => setScene({ page: 'home' })}
      />
    );
  }

  return (
    <Home
      onJoin={(data) => setScene({ page: 'room', ...data })}
    />
  );
}
