const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const DB_PATH = process.env.DB_PATH || '/directus/database/data.db';

const VALHALLA_HOST = process.env.VALHALLA_HOST || 'http://iterviae_valhalla:8002';
const TILESERVER_HOST = process.env.TILESERVER_HOST || 'http://iterviae_tileserver:8080';

let db = null;
function getDb() {
  if (!db) {
    try {
      db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
    } catch (err) {
      console.error('Error opening Directus SQLite database:', err);
    }
  }
  return db;
}

// 🛡️ API Key Verification Middleware
function validateApiKey(req, res, next) {
  // Extract API key from query param, X-API-Key header, or Authorization header
  let apiKey = req.query.key || req.headers['x-api-key'];
  if (!apiKey && req.headers['authorization']) {
    const parts = req.headers['authorization'].split(' ');
    if (parts.length === 2 && (parts[0] === 'Bearer' || parts[0] === 'Key')) {
      apiKey = parts[1];
    }
  }

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing required API key. Provide ?key=... parameter or X-API-Key header.'
    });
  }

  const cleanKey = apiKey.trim();

  try {
    const database = getDb();
    if (!database) {
      // If DB is temporarily unreadable, fall through gracefully or retry
      return res.status(503).json({ error: 'Service Temporarily Unavailable', message: 'Database connecting...' });
    }

    const stmt = database.prepare('SELECT status, owner_name, tier FROM api_keys WHERE key = ?');
    const record = stmt.get(cleanKey);

    if (!record) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key.'
      });
    }

    if (record.status !== 'active') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: `API Key is currently ${record.status}. Contact administrator.`
      });
    }

    // Attach validated key metadata to request
    req.apiKeyMeta = record;
    next();
  } catch (err) {
    console.error('Database query error in Gateway:', err);
    // Re-initialize DB connection in case file was replaced
    db = null;
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'iterviae-gateway' });
});

// Apply Key Validation Middleware to all routes below
app.use(validateApiKey);

// Proxy Valhalla routing calls
app.use('/route', createProxyMiddleware({
  target: VALHALLA_HOST,
  changeOrigin: true,
  pathRewrite: { '^/route': '/route' },
  onError: (err, req, res) => {
    console.error('Valhalla Proxy Error:', err);
    res.status(502).json({ error: 'Bad Gateway', message: 'Valhalla routing engine unavailable' });
  }
}));

// Proxy TileServer vector tile calls
app.use('/tiles', createProxyMiddleware({
  target: TILESERVER_HOST,
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('TileServer Proxy Error:', err);
    res.status(502).json({ error: 'Bad Gateway', message: 'TileServer vector tiles unavailable' });
  }
}));

// Fallback proxy for all other requests
app.use('/', createProxyMiddleware({
  target: TILESERVER_HOST,
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Fallback Proxy Error:', err);
    res.status(502).json({ error: 'Bad Gateway' });
  }
}));

app.listen(PORT, () => {
  console.log(`🚀 Iter Viae API Validation Gateway running on port ${PORT}`);
  console.log(`  - Database: ${DB_PATH}`);
  console.log(`  - Valhalla Target: ${VALHALLA_HOST}`);
  console.log(`  - TileServer Target: ${TILESERVER_HOST}`);
});
