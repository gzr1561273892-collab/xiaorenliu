const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ----- 读取 .env -----
function loadEnv(filePath) {
  const env = {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
      }
    });
  } catch (e) { /* .env file optional, fall back to process.env */ }
  return env;
}

const localEnv = loadEnv(path.join(__dirname, '.env'));
const API_KEY = localEnv.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
const PORT = parseInt(localEnv.PORT || process.env.PORT || '3000', 10);

if (!API_KEY) {
  console.error('错误：未设置 DEEPSEEK_API_KEY。请在 .env 文件中设置或通过环境变量传入。');
  process.exit(1);
}

// ----- 读取 index.html -----
const HTML_PATH = path.join(__dirname, 'index.html');
const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');

// ----- MIME 类型 -----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ----- 创建服务器 -----
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // POST /api/divine — 代理到 DeepSeek
  if (req.method === 'POST' && url.pathname === '/api/divine') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const proxyReq = https.request({
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30000,
      }, proxyRes => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        proxyRes.pipe(res);
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'DeepSeek API 请求超时' }));
      });

      proxyReq.on('error', err => {
        console.error('代理请求失败:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '后端服务暂时不可用' }));
      });

      proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  // OPTIONS — CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // GET / 或其他路径 — 只允许 index.html
  let reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
  // 安全检查：防止路径穿越
  reqPath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  // 在 Windows 上 normalize 会用反斜杠，统一转成正斜杠比较
  reqPath = reqPath.replace(/\\/g, '/');

  if (reqPath !== '/index.html') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(htmlContent);
});

server.listen(PORT, () => {
  console.log(`道家小壬六 服务已启动: http://localhost:${PORT}`);
  console.log('API 代理已就绪，密钥安全存储于后端');
});
