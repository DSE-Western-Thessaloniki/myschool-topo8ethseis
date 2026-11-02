import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { bus, subscribe } from "../bus.js";
import { errorText } from "../errors.js";
import { ensureDataDirs, errorShotPath, imgDir, rootDir } from "../paths.js";
import { runner } from "../runner.js";
import {
  describeCredentials,
  getCredentials,
  saveCredentials,
} from "../settings.js";
import { getSelectedFile, parseXlsx, setSelectedFile } from "../xlsx.js";

/** Ρίζα του project (dist/src/ui/server.js → ../../../) */
const publicDir = path.join(rootDir, "public");
const compiledPublicDir = path.join(rootDir, "dist", "public");

/** Μέγιστο μέγεθος αρχείου xlsx που δέχεται ο διακομιστής */
const MAX_XLSX_BYTES = 25 * 1024 * 1024;

/**
 * Δημιουργεί έναν route που επιστρέφει στιγμιότυπα από το φάκελο img ή το
 * error.png, αποφεύγοντας πάντα διαδρομές εκτός αυτών.
 */
function shotsHandler(req: express.Request, res: express.Response): void {
  // Μόνο το όνομα του αρχείου, ώστε να μην είναι δυνατή διαφυγή διαδρομής
  const file = path.basename(String(req.params.file ?? ""));
  if (!file.toLowerCase().endsWith(".png")) {
    res.sendStatus(404);
    return;
  }
  const target =
    file === "error.png" ? errorShotPath() : path.join(imgDir(), file);
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
 * @param {number} port - Η θύρα ακρόασης (π.χ. 8787). Το 0 δηλώνει τυχαία
 *   ελεύθερη θύρα (χρησιμοποιείται από την εφαρμογή).
 *
 * @returns {Promise<number>} Η πραγματική θύρα στην οποία ακούει ο διακομιστής.
 */
export function startServer(port: number): Promise<number> {
  const app = express();

  // Οι φάκελοι δεδομένων (img/) πρέπει να υπάρχουν πριν γραφτούν στιγμιότυπα
  ensureDataDirs();

  // Τα στατικά της διεπαφής (index.html, styles.css) και ο κώδικας που
  // μεταγλωττίστηκε από public/app.ts σε dist/public/app.js
  app.use(express.static(publicDir));
  app.use(express.static(compiledPublicDir));

  app.get("/shots/:file", shotsHandler);

  // Κενή σελίδα-στόχος για το παράθυρο εργασίας της εφαρμογής: δημιουργείται
  // με μοναδικό URL ώστε να το βρίσκουμε μέσω CDP (το Target.createTarget δεν
  // υποστηρίζεται από τον Electron).
  app.get("/automation", (_req, res) => {
    res
      .type("html")
      .send(
        '<!DOCTYPE html><html lang="el"><head><meta charset="utf-8">' +
          "<title>Εργασία</title></head><body></body></html>",
      );
  });

  app.get("/api/status", (_req, res) => {
    res.json(bus.snapshot());
  });

  /* ---------------- Ρυθμίσεις ---------------- */

  app.get("/api/settings", (_req, res) => {
    describeCredentials()
      .then((info) => res.json(info))
      .catch((err) => {
        res.status(500).json({ error: errorText(err) });
      });
  });

  app.post("/api/settings", express.json(), (req, res) => {
    const body = req.body as { username?: unknown; password?: unknown };
    const username =
      typeof body?.username === "string" ? body.username.trim() : "";
    const incomingPassword =
      typeof body?.password === "string" ? body.password : "";

    getCredentials()
      .then(async (current) => {
        // Κενό πεδίο κωδικού = κράτα τον ήδη αποθηκευμένο
        const password = incomingPassword || current.password;
        if (!username) {
          res.status(400).json({ error: "Συμπλήρωσε το όνομα χρήστη" });
          return;
        }
        if (!password) {
          res.status(400).json({ error: "Συμπλήρωσε τον κωδικό" });
          return;
        }
        const saved = await saveCredentials({ username, password });
        const info = await describeCredentials();
        res.json({ ok: true, ...saved, info });
      })
      .catch((err) => {
        res.status(500).json({ error: errorText(err) });
      });
  });

  /* ---------------- Αρχείο xlsx ---------------- */

  app.get("/api/xlsx", (_req, res) => {
    const selected = getSelectedFile();
    const fallback = fs.existsSync(path.join(rootDir, "file.xlsx"));
    res.json(
      selected
        ? {
            selected: true,
            name: selected.name,
            rowCount: selected.rowCount,
            fallback,
          }
        : { selected: false, fallback },
    );
  });

  app.post(
    "/api/xlsx",
    express.raw({ type: "*/*", limit: MAX_XLSX_BYTES }),
    (req, res) => {
      const name = String(req.query.name ?? "αρχείο.xlsx");
      const body = req.body;

      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ ok: false, error: "Δεν στάλθηκε αρχείο" });
        return;
      }

      try {
        const parsed = parseXlsx(body);
        setSelectedFile({
          name,
          rows: parsed.rows,
          rowCount: parsed.rowCount,
        });
        res.json({
          ok: true,
          name,
          rowCount: parsed.rowCount,
          headers: parsed.headers,
        });
      } catch (err) {
        // Η προσπάθεια επιλογής απέτυχε, οπότε δεν έχουμε πλέον αρχείο
        setSelectedFile(null);
        res.status(400).json({ ok: false, error: errorText(err) });
      }
    },
  );

  /* ---------------- Εκτέλεση ---------------- */

  app.post("/api/run", (_req, res) => {
    if (runner.isRunning()) {
      res.status(409).json({ error: "Η εργασία εκτελείται ήδη" });
      return;
    }

    // Έλεγχος πριν την εκκίνηση, ώστε ο χρήστης να λαμβάνει καθαρό μήνυμα
    // αντί να αποτυγχάνει η εργασία στη μέση.
    Promise.all([getCredentials()])
      .then(([credentials]) => {
        if (!credentials.username || !credentials.password) {
          res.status(400).json({
            error: "Δεν ορίστηκαν στοιχεία σύνδεσης. Άνοιξε τις «Ρυθμίσεις».",
          });
          return;
        }
        if (
          !getSelectedFile() &&
          !fs.existsSync(path.join(rootDir, "file.xlsx"))
        ) {
          res.status(400).json({
            error: "Δεν επιλέχτηκε αρχείο xlsx.",
          });
          return;
        }
        res.status(202).json({ ok: true });
        runner.run().catch((err) => {
          console.error(err);
        });
      })
      .catch((err) => {
        res.status(500).json({ error: errorText(err) });
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

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      const address = server.address();
      const actual =
        address && typeof address === "object" ? address.port : port;
      console.log(
        `Η διεπαφή ελέγχου είναι διαθέσιμη στο http://localhost:${actual}`,
      );
      resolve(actual);
    });
  });
}
