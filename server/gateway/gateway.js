const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');

const app = express();
const DB_PATH = process.env.DB_PATH || '/directus/database/data.db';

const VALHALLA_HOST = process.env.VALHALLA_HOST || 'http://iterviae_valhalla:8002';
const TILESERVER_HOST = process.env.TILESERVER_HOST || 'http://iterviae_tileserver:8080';

// 🌐 Enable CORS for all incoming requests (Mensa Desktop & Web Apps)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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

// Helper function to send CORS JSON responses
function sendCorsResponse(res, status, jsonObj) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  return res.status(status).json(jsonObj);
}

// 🛡️ API Key Verification Middleware
function validateApiKey(req, res, next) {
  let apiKey = req.query.key || req.headers['x-api-key'];
  if (!apiKey && req.headers['authorization']) {
    const parts = req.headers['authorization'].split(' ');
    if (parts.length === 2 && (parts[0] === 'Bearer' || parts[0] === 'Key')) {
      apiKey = parts[1];
    }
  }

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return sendCorsResponse(res, 401, {
      error: 'Unauthorized',
      message: 'Missing required API key. Provide ?key=... parameter or X-API-Key header.'
    });
  }

  const cleanKey = apiKey.trim();

  try {
    const database = getDb();
    if (!database) {
      return sendCorsResponse(res, 503, { error: 'Service Temporarily Unavailable', message: 'Database connecting...' });
    }

    const stmt = database.prepare('SELECT status, owner_name, tier FROM api_keys WHERE key = ?');
    const record = stmt.get(cleanKey);

    if (!record) {
      return sendCorsResponse(res, 401, {
        error: 'Unauthorized',
        message: 'Invalid API key.'
      });
    }

    if (record.status !== 'active') {
      return sendCorsResponse(res, 401, {
        error: 'Unauthorized',
        message: `API Key is currently ${record.status}. Contact administrator.`
      });
    }

    // Attach validated key metadata to request
    req.apiKeyMeta = record;
    next();
  } catch (err) {
    console.error('Database query error in Gateway:', err);
    db = null;
    return sendCorsResponse(res, 500, { error: 'Internal Server Error' });
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'iterviae-gateway' });
});

// Apply Key Validation Middleware to all routes below
app.use(validateApiKey);

// Proxy Response CORS Helper
function onProxyRes(proxyRes, req, res) {
  proxyRes.headers['access-control-allow-origin'] = '*';
  proxyRes.headers['access-control-allow-headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key';
  proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
}

function onProxyError(err, req, res) {
  console.error('Proxy Error:', err);
  if (!res.headersSent) {
    res.writeHead(502, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({ error: 'Bad Gateway', message: 'Target service unavailable' }));
  }
}

// Proxy Valhalla routing calls (exact match without trailing slash)
app.use('/route', createProxyMiddleware({
  target: VALHALLA_HOST + '/route',
  changeOrigin: true,
  pathRewrite: { '^/route': '' },
  onProxyRes: onProxyRes,
  onError: onProxyError
}));

// Proxy TileServer vector tile calls
app.use('/tiles', createProxyMiddleware({
  target: TILESERVER_HOST,
  changeOrigin: true,
  onProxyRes: onProxyRes,
  onError: onProxyError
}));

// Fallback proxy for all other requests (e.g. /data/v3/...)
app.use('/', createProxyMiddleware({
  target: TILESERVER_HOST,
  changeOrigin: true,
  onProxyRes: onProxyRes,
  onError: onProxyError
}));

// ALWAYS listen on Port 8000 AND Port 80 simultaneously
http.createServer(app).listen(8000, () => {
  console.log('🚀 Iter Viae Gateway listening on Port 8000');
});

http.createServer(app).listen(80, () => {
  console.log('🚀 Iter Viae Gateway listening on Port 80');
}).on('error', (e) => {
  console.log('Port 80 binding note:', e.message);
});
