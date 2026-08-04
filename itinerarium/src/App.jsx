import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import NavBar         from './NavBar';
import WelcomeScreen  from './WelcomeScreen';
import WikiPage       from './WikiPage';
import BlogPage       from './BlogPage';
import DownloadsPage  from './DownloadsPage';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <NavBar />
        <Routes>
          <Route path="/"          element={<WelcomeScreen />} />
          <Route path="/wiki"      element={<WikiPage />} />
          <Route path="/blog"      element={<BlogPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
