import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { DisplayPage } from './routes/DisplayPage';
import { CamPage } from './routes/CamPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DisplayPage />} />
        <Route path="/cam" element={<CamPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
