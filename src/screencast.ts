import type { CDPSession, Page } from "puppeteer-core";

export type ScreencastHandle = {
  /** Σταματά την μετάδοση και αποσυνδέει την σύνδεση CDP */
  detach: () => Promise<void>;
};

/** Ελάχιστο διάστημα ανάμεσα σε δύο καρέ (προς αποφυγή κατακόρυφης φόρτου) */
const MIN_FRAME_INTERVAL_MS = 150;

/**
 * Ξεκινά ζωντανή μετάδοση της σελίδας (Page.startScreencast) σε ένα δεύτερο
 * session CDP και καλεί το onFrame με το base64 jpeg κάθε καρέ.
 *
 * Τα καρέ δεν παράγονται σε σταθερό ρυθμό παρά μόνο όταν η σελίδα
 * ανανεώνεται, οπότε η εφαρμογή πρέπει να αναμένει καινούργιο καρέ για να
 * εμφανίζει κίνηση.
 *
 * @param {Page} page - Η σελίδα που παρακολουθούμε.
 * @param {(data: string) => void} onFrame - Κληθεί με το base64 jpeg κάθε καρέ.
 *
 * @returns {Promise<ScreencastHandle>} Χειριστήριο για διακοπή της μετάδοσης.
 */
export async function attachScreencast(
  page: Page,
  onFrame: (data: string) => void
): Promise<ScreencastHandle> {
  const client: CDPSession = await page.target().createCDPSession();
  await client.send("Page.enable");

  let lastFrameAt = 0;

  const onScreencastFrame = (params: {
    data: string;
    sessionId: number;
  }): void => {
    const now = Date.now();
    if (now - lastFrameAt >= MIN_FRAME_INTERVAL_MS) {
      lastFrameAt = now;
      try {
        onFrame(params.data);
      } catch {
        // Αγνόησε σφάλματα αποστολής στους πελάτες
      }
    }
    // Πρέπει να γίνει ack σε κάθε καρέ αλλιώς σταματά η μετάδοση
    client.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {
      // Η σύνδεση έκλεισε ήδη
    });
  };

  client.on("Page.screencastFrame", onScreencastFrame);

  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 60,
    maxWidth: 1600,
    maxHeight: 1000,
    everyNthFrame: 1,
  });

  return {
    detach: async () => {
      try {
        client.off("Page.screencastFrame", onScreencastFrame);
        await client.send("Page.stopScreencast");
        await client.detach();
      } catch {
        // Ήδη αποσυνδεδεμένο
      }
    },
  };
}
