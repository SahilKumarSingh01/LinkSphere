// src/App.jsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Home from './pages/Home.jsx';
import About from './pages/About.jsx'
import NotFound from './pages/NotFound.jsx';
import Navbar from './components/Navbar.jsx';
import './styles/global.css';

const App = () => {
  return (
    <Router>
      <div className="app-container">
        <Navbar/>
        <main style={{ minHeight: '80vh' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />

            {/* Add more routes here later */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
