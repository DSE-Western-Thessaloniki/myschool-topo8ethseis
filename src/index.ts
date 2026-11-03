import dotenv from "dotenv";
import * as consoleStamp from "console-stamp";
import { installLogger } from "./logger.js";
import { runner } from "./runner.js";
import { startServer } from "./ui/server.js";

// Διάβασε τις ρυθμίσεις από το .env αρχείο
dotenv.config();

// Πρόσθεσε χρονοσφραγίδα στα μηνύματα του αρχείου καταγραφής
(consoleStamp as unknown as (target: Console) => void)(console);

// Αιχμαλώτισε τα μηνύματα της κονσόλας για να εμφανίζονται ζωντανά στην
// διεπαφή (πρέπει να γίνει μετά το consoleStamp, ώστε να μην καταγράφεται
// η χρονοσφραγίδα δύο φορές)
installLogger();

const port = Number(process.env.UI_PORT) || 8787;
startServer(port).catch((err) => {
  console.error(err);
  process.exit(1);
});

// Η εντολή `npm run start` εκτελεί αμέσως την εργασία (συμπεριφορά της
// έκδοσης χωρίς διεπαφή). Η εντολή `npm run ui` ή το --no-run αφήνει την
// διεπαφή έτοιμη χωρίς αυτόματη εκκίνηση.
const noRun =
  process.argv.includes("--no-run") || process.env.AUTO_RUN === "false";

if (noRun) {
  console.log(
    "Η διεπαφή ετοιμάστηκε χωρίς αυτόματη εκκίνηση. Πάτησε «Εκκίνηση» στον browser.",
  );
} else {
  runner.run().catch((err) => {
    console.error(err);
  });
}
