const http = require('http');
const fs = require('fs');
const path = require('path');

const { spawn } = require('child_process');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'frontend');

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json'
};

const https = require('https');

const server = http.createServer((req, res) => {
    // 0. Immich Image Proxy to bypass Cross-Origin-Resource-Policy same-origin header
    if (req.url.startsWith('/api/immich-proxy')) {
        const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
        const targetUrl = parsedUrl.searchParams.get('url');
        if (!targetUrl || !targetUrl.startsWith('https://immich-muhen.danfamily.uk/')) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid URL');
            return;
        }

        https.get(targetUrl, (imgRes) => {
            const headers = {
                'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
                'Cache-Control': 'public, max-age=604800',
                'Access-Control-Allow-Origin': '*',
                'Cross-Origin-Resource-Policy': 'cross-origin'
            };
            res.writeHead(imgRes.statusCode, headers);
            imgRes.pipe(res);
        }).on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Proxy Error: ' + err.message);
        });
        return;
    }

    // 1. API endpoint to save galerie.json directly
    if (req.method === 'POST' && req.url === '/api/save-galerie') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const targetPath = path.join(PUBLIC_DIR, 'data', 'galerie.json');
                fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Erfolgreich in data/galerie.json gespeichert!' }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // 2. API endpoint to run ai-sync-gallery.js and stream output in real-time
    if (req.method === 'POST' && req.url === '/api/run-sync') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
        });
        req.on('end', () => {
            try {
                const params = JSON.parse(body || '{}');
                const sourceDir = (params.sourceDir || '').trim();
                const userApiKey = (params.apiKey || '').trim();

                // Build env variables
                const customEnv = { ...process.env };
                if (userApiKey) {
                    customEnv.GEMINI_API_KEY = userApiKey;
                }

                // Set headers for real-time text chunk streaming
                res.writeHead(200, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Transfer-Encoding': 'chunked',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });

                res.write("🤖 Starte KI-Synchronisationsprozess...\n");

                // Spawn child process node ai-sync-gallery.js
                const child = spawn('node', ['ai-sync-gallery.js'], {
                    cwd: __dirname,
                    env: customEnv
                });

                child.stdout.on('data', data => {
                    const output = data.toString();
                    res.write(output);

                    // Automate inputs to the interactive CLI prompts
                    if (output.includes("Pfad zum lokalen Flickr-Bilderordner")) {
                        child.stdin.write(sourceDir + "\n");
                    }
                    if (output.includes("Möchtest du diese jetzt von der Gemini KI beschreiben und taggen lassen")) {
                        child.stdin.write("ja\n");
                    }
                    if (output.includes("Möchtest du einen Re-Scan für Bilder durchführen, bei denen noch keine Personen markiert wurden?")) {
                        child.stdin.write("ja\n");
                    }
                    if (output.includes("Kein API-Key angegeben") || output.includes("Bitte gib deinen Google Gemini API-Key ein")) {
                        if (!customEnv.GEMINI_API_KEY) {
                            child.stdin.write("\n");
                        }
                    }
                });

                child.stderr.on('data', data => {
                    res.write(`⚠️ FEHLER: ${data.toString()}`);
                });

                child.on('close', code => {
                    res.write(`\n🏁 Prozess beendet mit Code ${code}\n`);
                    res.end();
                });

                child.on('error', err => {
                    res.write(`❌ Fehler beim Starten des Skripts: ${err.message}\n`);
                    res.end();
                });

            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end(`Fehler: ${err.message}`);
            }
        });
        return;
    }

    // 3. Serve static files from frontend folder
    let reqUrl = req.url.split('?')[0];
    if (reqUrl === '/') reqUrl = '/index.html';
    
    const filePath = path.join(PUBLIC_DIR, reqUrl);
    
    // Safety check: prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log("\n=======================================================");
    console.log("   Sportschützen Muhen - Galerie-Editor Server         ");
    console.log("=======================================================\n");
    console.log(`🟢 Server läuft unter: http://localhost:${PORT}`);
    console.log(`👉 Öffne: http://localhost:${PORT}/galerie-editor.html`);
    console.log(`\n💡 Änderungen werden hierdurch DIREKT in data/galerie.json`);
    console.log(`   gespeichert, ohne dass du Dateien herunterladen musst!`);
    console.log("=======================================================\n");
});
