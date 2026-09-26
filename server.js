const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8085;
const BASE_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.pdf': 'application/pdf',
    '.sql': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        let decodedPath = decodeURIComponent(parsedUrl.pathname);
        if (decodedPath === '/') decodedPath = '/vorstand/index.html';

        let safePath = path.normalize(path.join(BASE_DIR, decodedPath));
        if (!safePath.startsWith(BASE_DIR)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }

        fs.stat(safePath, (err, stats) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found: ' + decodedPath);
                return;
            }

            let targetFile = safePath;
            if (stats.isDirectory()) {
                targetFile = path.join(safePath, 'index.html');
                if (!fs.existsSync(targetFile)) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found');
                    return;
                }
            }

            const fileStat = stats.isDirectory() ? fs.statSync(targetFile) : stats;
            const ext = path.extname(targetFile).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Content-Length': fileStat.size
            });

            if (req.method === 'HEAD') {
                res.end();
                return;
            }

            const stream = fs.createReadStream(targetFile);
            stream.on('error', (streamErr) => {
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                }
                res.end('Read error: ' + streamErr.message);
            });
            stream.pipe(res);
        });
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server error: ' + e.message);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Vorstand Dev Server running on http://localhost:${PORT}/vorstand/index.html`);
});
