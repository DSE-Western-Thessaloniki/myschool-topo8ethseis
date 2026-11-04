import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import type { Browser, Page } from "puppeteer-core";
import { bus } from "./bus.js";
import { errorText } from "./errors.js";
import { errorShotPath, rootDir } from "./paths.js";
import { attachScreencast } from "./screencast.js";
import type { ScreencastHandle } from "./screencast.js";
import { default as start } from "./start.js";
import type { XLSX_JSON } from "./types.js";
import { getSelectedFile, parseXlsx } from "./xlsx.js";

/** Παραγωγή της σελίδας που θα ελέγξει η εργασία */
export type PageFactory = (browser: Browser) => Promise<Page>;

let pageFactory: PageFactory | undefined;

/**
 * Ορίζει πώς δημιουργείται η σελίδα εργασίας.
 *
 * Στην εφαρμογή επιφάνειας εργασίας το Target.createTarget του CDP δεν
 * υποστηρίζεται από τον Electron, οπότε το παράθυρο πρέπει να δημιουργήσει
 * ο κύριος κώδικας του Electron και εμείς να το βρούμε μέσω CDP. Στο dev
 * container παραμένει η προεπιλογή (browser.newPage()).
 *
 * @param {PageFactory | undefined} factory - Η νέα συνάρτηση ή undefined.
 *
 * @returns {void}
 */
export function setPageFactory(factory: PageFactory | undefined): void {
  pageFactory = factory;
}

/**
 * Διαβάζει τα δεδομένα από το αρχείο που επέλεξε ο χρήστης από τη διεπαφή.
 *
 * Αν δεν έχει επιλεγεί αρχείο (συμπεριφορά της ανάπτυξης μέσα στο dev
 * container) χρησιμοποιείται το file.xlsx της ρίζας του project.
 *
 * @throws {Error} αν δεν υπάρχει κανένα αρχείο ή λείπουν στήλες.
 * @returns {XLSX_JSON[]} Οι γραμμές του αρχείου.
 */
function loadXlsxData(): XLSX_JSON[] {
  const selected = getSelectedFile();
  if (selected) {
    console.log(`Ανάγνωση του επιλεγμένου αρχείου «${selected.name}»`);
    return selected.rows;
  }

  const fallback = path.join(rootDir, "file.xlsx");
  if (!fs.existsSync(fallback)) {
    throw new Error("Δεν επιλέχτηκε αρχείο xlsx και δεν βρέθηκε το file.xlsx");
  }
  console.log("Ανάγνωση xlsx αρχείου (file.xlsx)");
  return parseXlsx(fs.readFileSync(fallback)).rows;
}

/** Τα στοιχεία μιας εκτελούμενης εργασίας */
type RunResult = { stopped: boolean } | undefined;

/**
 * Διαχειρίζεται τον κύκλο ζωής της εργασίας: σύνδεση με τον φυλλομετρητή,
 * εκτέλεση των τοποθετήσεων, καθαρισμός και αναφορά κατάστασης στο event bus.
 */
class Runner {
  private running = false;
  private stopped = false;
  private activePage: Page | null = null;
  private activeBrowser: Browser | null = null;
  private cast: ScreencastHandle | null = null;
  /** Τελευταία λήψη οθόνης για τους πελάτες που συνδέονται καθυστερημένα */
  private lastFrame = 0;

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Ξεκινά νέα εργασία. Αν μια εργασία εκτελείται ήδη κάνει τίποτα.
   *
   * @returns {Promise<void>} Ολοκληρώνεται όταν τερματίσει η εργασία.
   */
  async run(): Promise<void> {
    if (this.running) {
      console.warn("Η εργασία εκτελείται ήδη!");
      return;
    }
    this.running = true;
    this.stopped = false;
    this.lastFrame = 0;

    bus.setState("running");
    console.log("Εκκίνηση νέας εργασίας");

    let xlsxData: XLSX_JSON[];
    try {
      xlsxData = loadXlsxData();
      console.log("Data", xlsxData);
    } catch (err) {
      this.fail(err);
      this.running = false;
      return;
    }

    // Από εδώ και πέρα ο πίνακας προόδου γεμίζει με τις γραμμές του αρχείου
    bus.reset(xlsxData);

    try {
      console.log("Αρχικοποίηση σύνδεσης με τον φυλλομετρητή");
      const endpoint =
        process.env.BROWSER_WS_ENDPOINT || "ws://host.docker.internal:3000";
      // Στην εφαρμογή το endpoint είναι το http του CDP του ίδιο του
      // Electron. Εκεί η σελίδα έχει ήδη το μέγεθος του παραθύρου της,
      // οπότε δεν επιβάλλουμε τακτικό viewport.
      const isHttp =
        endpoint.startsWith("http://") || endpoint.startsWith("https://");
      const browser = await puppeteer.connect({
        ...(isHttp
          ? { browserURL: endpoint, defaultViewport: null }
          : { browserWSEndpoint: endpoint }),
        acceptInsecureCerts: true,
      });
      this.activeBrowser = browser;
      // Καθαρισμός των cookies ώστε να μην επηρεάζουν την εκτέλεση προηγούμενες συνδέσεις
      console.log("Καθαρισμός cookies του φυλλομετρητή");
      await browser.deleteCookie(...(await browser.cookies()));
      const page = pageFactory
        ? await pageFactory(browser)
        : await browser.newPage();
      this.activePage = page;

      // Ζωντανή προβολή της σελίδας στην διεπαφή
      this.cast = await attachScreencast(page, (data) => bus.frame(data));

      if (
        process.env.SCRAPE_TEST_REMOTE_DEBUG &&
        process.env.SCRAPE_TEST_REMOTE_DEBUG === "true"
      ) {
        // https://github.com/puppeteer/puppeteer/issues/5730
        console.log(
          "Remote debugging enabled, disabling touch events before click.",
        );

        page.click = (function (originalMethod, context) {
          return async function (...args) {
            const CDPSession = await context.target().createCDPSession();
            await CDPSession.send("Emulation.setEmitTouchEventsForMouse", {
              enabled: false,
            });
            await CDPSession.send("Emulation.setTouchEmulationEnabled", {
              enabled: false,
            });
            return originalMethod.apply(context, [...args]);
          };
        })(page.click, page);
      }

      const result: RunResult = await start({
        page,
        xlsxData,
        isStopped: () => this.stopped,
      });

      if (result?.stopped || this.stopped) {
        console.log("Η εργασία διακόπηκε από τον χρήστη");
        bus.setState("stopped", "Η εργασία διακόπηκε από τον χρήστη");
      } else {
        console.log("Η εργασία ολοκληρώθηκε!");
        bus.setState("done", "Η εργασία ολοκληρώθηκε!");
      }
    } catch (err) {
      if (this.stopped) {
        console.log("Η εργασία διακόπηκε από τον χρήστη");
        bus.setState("stopped", "Η εργασία διακόπηκε από τον χρήστη");
      } else {
        await this.takeErrorScreenshot();
        this.fail(err);
      }
    } finally {
      await this.cleanup();
      this.running = false;
    }
  }

  /**
   * Διακόπτει την τρέχουσα εργασία. Κλείνει την ενεργή σελίδα ώστε να
   * διακοπούν αμέσως και όσα βήματα αναμένουν για ενέργειες (waitForSelector κ.λπ.).
   */
  stop(): void {
    if (!this.running) {
      return;
    }
    if (this.stopped) {
      return;
    }
    console.warn("Διακοπή της εργασίας από τον χρήστη...");
    this.stopped = true;
    const page = this.activePage;
    if (page) {
      page.close().catch(() => undefined);
    }
  }

  /**
   * Στέλνει ένα καρέ της τρέχουσας σελίδας στους πελάτες (χρήσιμο για
   * πελάτες που συνδέονται ενώ η σελίδα είναι ακίνητη και το screencast
   * δεν παράγει καρέ).
   */
  async requestFrame(): Promise<void> {
    const page = this.activePage;
    if (!page || Date.now() - this.lastFrame < 300) {
      return;
    }
    this.lastFrame = Date.now();
    try {
      const data = await page.screenshot({ type: "jpeg", quality: 50 });
      bus.frame(Buffer.from(data).toString("base64"));
    } catch {
      // Η σελίδα έκλεισε εντωμεταξύ
    }
  }

  private fail(err: unknown): void {
    const message = errorText(err);
    console.error(err);
    bus.setState("error", message);
  }

  private async takeErrorScreenshot(): Promise<void> {
    const page = this.activePage;
    if (!page) return;
    try {
      await page.screenshot({ path: errorShotPath(), fullPage: true });
      console.log("Αποθηκεύτηκε στιγμιότυπο σφάλματος στο error.png");
    } catch {
      console.warn("Δεν ήταν δυνατή η λήψη στιγμιότυπου σφάλματος");
    }
  }

  private async cleanup(): Promise<void> {
    if (this.cast) {
      await this.cast.detach();
      this.cast = null;
    }
    const browser = this.activeBrowser;
    const page = this.activePage;
    this.activeBrowser = null;
    this.activePage = null;
    // Κλείσε μόνο τη σελίδα που δημιουργήσαμε εμείς. Στην εφαρμογή τα
    // υπόλοιπα παράθυρα (π.χ. η διεπαφή ελέγχου) πρέπει να μείνουν ανοιχτά.
    if (page) {
      await page.close().catch(() => undefined);
    }
    if (!browser) return;
    try {
      if (pageFactory) {
        // Ο «φυλλομετρητής» είναι το ίδιο το Electron: το close θα
        // τερμάτιζε την εφαρμογή, οπότε απλώς αποσυνδεόμαστε.
        browser.disconnect();
      } else {
        await browser.close();
      }
    } catch {
      // Η σύνδεση έχει ήδη κλείσει
    }
  }
}

export const runner = new Runner();
