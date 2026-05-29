import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

// StrictMode disabled — Tone.js Transport scheduling breaks under double-render
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
