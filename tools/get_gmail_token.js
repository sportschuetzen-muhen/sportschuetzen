import http from "node:http";
import https from "node:https";
import readline from "node:readline";

console.log("=== Gmail OAuth Setup Helper ===");
console.log("Dieses Skript holt den Refresh-Token für sportschuetzen.muhen@gmail.com\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Client-ID eingeben: ", (clientId) => {
  rl.question("Client-Secret eingeben: ", (clientSecret) => {
    clientId = clientId.trim();
    clientSecret = clientSecret.trim();

    const redirectUri = "http://localhost:8085/oauth2callback";
    const scope = encodeURIComponent("https://www.googleapis.com/auth/gmail.modify");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

    console.log("\n1. Öffne diesen Link im Browser (mit sportschuetzen.muhen@gmail.com einloggen):");
    console.log(authUrl);
    console.log("\n2. Warte auf Bestätigung auf http://localhost:8085 ...");

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (url.pathname === "/oauth2callback") {
          const code = url.searchParams.get("code");
          if (!code) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<h3>Kein Code erhalten.</h3>");
            return;
          }

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h2>Erfolg! Du kannst dieses Fenster schliessen und ins Terminal zurückkehren.</h2>");

          server.close();
          rl.close();

          // Token abrufen
          console.log("\nTausche Autorisierungscode gegen Tokens...");
          const tokenData = await exchangeCode(clientId, clientSecret, code, redirectUri);
          
          console.log("\n=======================================================");
          console.log("ERFOLG! Hier sind deine Zugangsdaten für CT 117:");
          console.log("=======================================================");
          console.log(`GMAIL_CLIENT_ID=${clientId}`);
          console.log(`GMAIL_CLIENT_SECRET=${clientSecret}`);
          console.log(`GMAIL_REFRESH_TOKEN=${tokenData.refresh_token}`);
          console.log("=======================================================");
          if (!tokenData.refresh_token) {
            console.log("⚠️ Hinweis: Kein refresh_token erhalten (evtl. war der Account bereits autorisiert).");
            console.log("Setze prompt=consent oder entziehe der App im Google-Konto die Berechtigung.");
          }
        }
      } catch (err) {
        console.error("Fehler bei Callback:", err);
      }
    });

    server.listen(8085);
  });
});

function exchangeCode(clientId, clientSecret, code, redirectUri) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString();

    const req = https.request(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}
