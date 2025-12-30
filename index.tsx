
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Shim para garantir que process.env existe no browser (necessário para o Gemini SDK em builds Vite)
if (typeof (window as any).process === 'undefined') {
  (window as any).process = { env: {} };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
