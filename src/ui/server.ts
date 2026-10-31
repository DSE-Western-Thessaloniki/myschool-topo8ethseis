import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { bus, subscribe } from "../bus.js";
import { runner } from "../runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Ρίζα του project (dist/src/ui/server.js → ../../../) */
const rootDir = path.resolve(__dirname, "..", "..", "..");
const publicDir = path.join(rootDir, "public");
const compiledPublicDir = path.join(rootDir, "dist", "public");
const imgDir = path.join(rootDir, "img");

/**
 * Δημιουργεί έναν route που επιστρέφει στιγμιότυπα από το φάκελο img ή το
 * error.png της ρίζας, αποφεύγοντας πάντα διαδρομές εκτός αυτών.
 */
function shotsHandler(
  req: express.Request,
  res: express.Response
): void {
  // Μόνο το όνομα του αρχείου, ώστε να μην είναι δυνατή διαφυγή διαδρομής
  const file = path.basename(String(req.params.file ?? ""));
  if (!file.toLowerCase().endsWith(".png")) {
    res.sendStatus(404);
    return;
  }
  const target =
    file === "error.png"
      ? path.join(rootDir, "error.png")
      : path.join(imgDir, file);
  res.sendFile(target, (err) => {
    if (err) {
      res.sendStatus(404);
    }
  });
}

/**
 * Ξεκινά την διεπαφή ελέγχου: στατικά αρχεία, REST API και ροή με
 * web socket για ζωντανά μηνύματα και καρέ.
 *
 * @param {number} port - Η θύρα ακρόασης (π.χ. 8787).
 *
 * @returns {void}
 */
export function startServer(port: number): void {
  const app = express();

  // Τα στατικά της διεπαφής (index.html, styles.css) και ο κώδικας που
  // μεταγλωττίστηκε από public/app.ts σε dist/public/app.js
  app.use(express.static(publicDir));
  app.use(express.static(compiledPublicDir));

  app.get("/shots/:file", shotsHandler);

  app.get("/api/status", (_req, res) => {
    res.json(bus.snapshot());
  });

  app.post("/api/run", (_req, res) => {
    if (runner.isRunning()) {
      res.status(409).json({ error: "Η εργασία εκτελείται ήδη" });
      return;
    }
    res.status(202).json({ ok: true });
    runner.run().catch((err) => {
      console.error(err);
    });
  });

  app.post("/api/stop", (_req, res) => {
    if (!runner.isRunning()) {
      res.status(409).json({ error: "Δεν υπάρχει ενεργή εργασία" });
      return;
    }
    runner.stop();
    res.json({ ok: true });
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    // Στείλε πρώτα την τρέχουσα εικόνα της εργασίας
    socket.send(JSON.stringify(bus.snapshot()));

    const unsubscribe = subscribe((event) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    });

    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);

    // Ζήτησε καρέ της τρέχουσας σελίδας αν η σελίδα είναι ακίνητη και
    // το screencast δεν στέλνει καρέ αυτή την στιγμή
    runner.requestFrame().catch(() => undefined);
  });

  server.listen(port, () => {
    console.log(`Η διεπαφή ελέγχου είναι διαθέσιμη στο http://localhost:${port}`);
  });
}
