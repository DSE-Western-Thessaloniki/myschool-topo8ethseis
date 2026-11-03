import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import consoleStamp from "console-stamp";
import { installLogger } from "../src/logger.js";
import { rootDir } from "../src/paths.js";
import { getPreferences, onPreferencesChanged } from "../src/preferences.js";
import { runner, setPageFactory } from "../src/runner.js";
import { startServer } from "../src/ui/server.js";

/** Παράθυρο με τη διεπαφή ελέγχου */
let controlWindow: BrowserWindow | null = null;

/** Το τρέχον (κρυφό) παράθυρο εργασίας, ώστε να εφαρμόζεται άμεσα η ρύθμιση debug */
let automationWindow: BrowserWindow | null = null;

/**
 * Βρίσκει μια ελεύθερη θύρα για το remote debugging του Chromium.
 *
 * @returns {Promise<number>} Η θύρα (προεπιλογή 9223 αν αποτύχει).
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolve(port || 9223));
    });
  });
}

/**
 * Περιμένει να εμφανιστεί μια σελίδα με συγκεκριμένο URL.
 *
 * Χρησιμοποιείται αντί για το waitForTarget ώστε να μην εξαρτάται από το
 * αν ο διακομιστής ανακοινώνει το target πριν ή μετά τη φόρτωση.
 *
 * @param {Browser} browser - Η σύνδεση CDP με τον φυλλομετρητή.
 * @param {string} url - Το ακριβές URL που περιμένουμε.
 *
 * @throws {Error} αν περάσει ο χρόνος αναμονής.
 * @returns {Promise<Page>} Η σελίδα που βρέθηκε.
 */
async function waitForPage(
  browser: import("puppeteer-core").Browser,
  url: string,
): Promise<import("puppeteer-core").Page> {
  const deadline = Date.now() + 20000;
  for (;;) {
    const pages = await browser.pages();
    const found = pages.find((page) => page.url() === url);
    if (found) {
      return found;
    }
    if (Date.now() > deadline) {
      throw new Error("Δεν βρέθηκε το παράθυρο εργασίας");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function main(): Promise<void> {
  // Το remote debugging πρέπει να οριστεί πριν το ready
  const debugPort = await freePort();
  app.commandLine.appendSwitch("remote-debugging-port", String(debugPort));

  await app.whenReady();

  // Ρυθμίσεις και στιγμιότυπα σε εγγράψιμο φάκελο δεδομένων εκτός του asar
  process.env.MYSCH_DATA_DIR = app.getPath("userData");
  const localTemplatePath = path.join(app.getPath("userData"), "template.xlsx");
  if (!fs.existsSync(localTemplatePath)) {
    const packagedTemplatePath = path.join(
      app.isPackaged ? process.resourcesPath : rootDir,
      "template.xlsx",
    );
    fs.copyFileSync(packagedTemplatePath, localTemplatePath);
  }
  process.env.MYSCH_TEMPLATE_PATH = localTemplatePath;
  // Ο φυλλομετρητής εργασίας είναι το ίδιο το Chromium της εφαρμογής
  process.env.BROWSER_WS_ENDPOINT = `http://127.0.0.1:${debugPort}`;

  // Ίδια συμπεριφορά με το src/index.ts: χρονοσφραγίδα στην κονσόλα και
  // αιχμαλώτιση των μηνυμάτων για τη ζωντανή προβολή στη διεπαφή
  (consoleStamp as unknown as (target: Console) => void)(console);
  installLogger();

  const port = await startServer(0);

  // Το Target.createTarget δεν υποστηρίζεται από τον Electron, οπότε το
  // παράθυρο εργασίας το δημιουργούμε εμείς και το «βρούμε» μέσω CDP.
  setPageFactory(async (browser) => {
    const marker = `http://127.0.0.1:${port}/automation?run=${Date.now()}`;
    // Από προεπιλογή το παράθυρο εργασίας είναι κρυφό, ώστε ο χρήστης να
    // μην μπορεί να πατήσει/πληκτρολογήσει μέσα του και να ανακατέψει την
    // εκτέλεση. Με τη ρύθμιση debug στις «Ρυθμίσεις» εμφανίζεται κανονικά.
    const automation = new BrowserWindow({
      width: 1280,
      height: 900,
      show: getPreferences().debugShowAutomation,
      autoHideMenuBar: true,
      webPreferences: {
        // Το κρυφό παράθυρο πρέπει να συνεχίζει να αποδίδει, ώστε να
        // παράγονται καρέ για τη ζωντανή προβολή στη διεπαφή και να
        // λειτουργούν οι αναμονές (waitForSelector κ.λπ.) της εργασίας.
        backgroundThrottling: false,
      },
    });
    automationWindow = automation;
    automation.on("closed", () => {
      if (automationWindow === automation) {
        automationWindow = null;
      }
    });
    try {
      await automation.loadURL(marker);
      const page = await waitForPage(browser, marker);
      return page;
    } catch (err) {
      if (!automation.isDestroyed()) {
        automation.close();
      }
      throw err;
    }
  });

  // Άμεση εφαρμογή της ρύθμισης debug ακόμη κι αν υπάρχει ήδη ενεργή
  // εργασία (ο κύριος κώδικας μοιράζεται τη διεργασία με τον διακομιστή).
  onPreferencesChanged((preferences) => {
    const window = automationWindow;
    if (!window || window.isDestroyed()) {
      return;
    }
    if (preferences.debugShowAutomation) {
      window.show();
    } else {
      window.hide();
    }
  });

  controlWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    autoHideMenuBar: true,
  });
  controlWindow.on("closed", () => {
    controlWindow = null;
  });

  // Τα στιγμιότυπα ανοίγουν σε νέο παράθυρο της εφαρμογής. Οτιδήποτε
  // άλλο προσπαθεί να ανοίξει παράθυρο απορρίπτεται.
  controlWindow.webContents.setWindowOpenHandler(({ url }) => {
    let allowed = false;
    try {
      const parsed = new URL(url);
      allowed =
        parsed.origin === `http://127.0.0.1:${port}` &&
        parsed.pathname.startsWith("/shots/");
    } catch {
      allowed = false;
    }
    return allowed
      ? {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 1100,
            height: 900,
            autoHideMenuBar: true,
          },
        }
      : { action: "deny" };
  });

  await controlWindow.loadURL(`http://127.0.0.1:${port}/`);
  controlWindow.show();

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("before-quit", () => {
    // Διακοπή ενεργής εργασίας ώστε να κλείσει και το παράθυρο εργασίας
    runner.stop();
  });
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
