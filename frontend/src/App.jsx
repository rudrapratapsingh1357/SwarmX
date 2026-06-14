import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import MissionControl from './pages/MissionControl';
import MissionReport from './pages/MissionReport';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/mission/:id" element={<MissionControl />} />
        <Route path="/report/:id" element={<MissionReport />} />
      </Routes>
    </Router>
  );
}
