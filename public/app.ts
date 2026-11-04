import type { RowInfo, RunState, ServerEvent, Snapshot } from "../src/bus.js";

/** Βρίσκει ένα στοιχείο της σελίδας ή ρίχνει σφάλμα αν δεν υπάρχει */
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error("Δεν βρέθηκε το στοιχείο: #" + id);
  }
  return node as T;
}

const els = {
  badge: el<HTMLSpanElement>("state-badge"),
  message: el<HTMLSpanElement>("message"),
  run: el<HTMLButtonElement>("btn-run"),
  stop: el<HTMLButtonElement>("btn-stop"),
  clear: el<HTMLButtonElement>("btn-clear"),
  conn: el<HTMLSpanElement>("conn"),
  frame: el<HTMLImageElement>("frame"),
  placeholder: el<HTMLDivElement>("placeholder"),
  rows: el<HTMLTableSectionElement>("rows"),
  empty: el<HTMLElement>("empty"),
  counts: el<HTMLSpanElement>("counts"),
  logPane: el<HTMLDivElement>("log-pane"),
  autoscroll: el<HTMLInputElement>("autoscroll"),
  /* Επιλογή αρχείου xlsx */
  filePicker: el<HTMLDivElement>("file-picker"),
  fileInput: el<HTMLInputElement>("xlsx-input"),
  btnFile: el<HTMLButtonElement>("btn-file"),
  fileStatus: el<HTMLSpanElement>("file-status"),
  templateDownload: el<HTMLAnchorElement>("template-download"),
  templateOpen: el<HTMLButtonElement>("template-open"),
  /* Ρυθμίσεις */
  btnSettings: el<HTMLButtonElement>("btn-settings"),
  settingsDialog: el<HTMLDialogElement>("settings-dialog"),
  settingsForm: el<HTMLFormElement>("settings-form"),
  setUsername: el<HTMLInputElement>("set-username"),
  setPassword: el<HTMLInputElement>("set-password"),
  setDebugWindow: el<HTMLInputElement>("set-debug-window"),
  settingsHint: el<HTMLElement>("settings-hint"),
  settingsError: el<HTMLElement>("settings-error"),
  settingsCancel: el<HTMLButtonElement>("btn-settings-cancel"),
};

const stateLabels: Record<RunState, string> = {
  idle: "Αδρανής",
  running: "Εκτελείται",
  done: "Ολοκληρώθηκε",
  error: "Σφάλμα",
  stopped: "Διακόπηκε",
};

const statusLabels: Record<RowInfo["status"], string> = {
  pending: "Αναμονή",
  processing: "Σε εκτέλεση",
  ok: "Ολοκληρώθηκε",
  error: "Σφάλμα",
};

/** Μέγιστο πλήθος μηνυμάτων στο παράθυρο καταγραφής */
const MAX_LOG_NODES = 1000;

const rowElements = new Map<number, HTMLTableRowElement>();

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTime(time: number): string {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

function value(record: RowInfo["record"], key: string): string {
  const found = record[key];
  return typeof found === "undefined" ? "" : String(found);
}

/* ---------------- Κατάσταση εργασίας ---------------- */

function setState(state: RunState, message?: string): void {
  const running = state === "running";
  els.badge.textContent = stateLabels[state];
  els.badge.className = "badge " + state;
  els.run.disabled = running;
  els.stop.disabled = !running;
  els.message.textContent = message ?? "";
}

/* ---------------- Πίνακας προόδου ---------------- */

function setScreenshot(index: number, file: string): void {
  const tr = rowElements.get(index);
  if (!tr) return;
  const cell = tr.cells[4];
  const name = file.split("/").pop() ?? file;
  // Το t= αποφεύγει την κρυφή αποθήκευση παλιών στιγμιότυπων
  const url = `/shots/${encodeURIComponent(name)}?t=${Date.now()}`;
  cell.replaceChildren();
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.title = "Άνοιγμα στιγμιότυπου σε νέο παράθυρο";
  const img = document.createElement("img");
  img.className = "thumb";
  img.src = url;
  img.alt = "Στιγμιότυπο";
  link.appendChild(img);
  cell.appendChild(link);
}

function renderRow(row: RowInfo): void {
  let tr = rowElements.get(row.index);

  if (!tr) {
    tr = document.createElement("tr");
    for (let i = 0; i < 5; i++) {
      tr.appendChild(document.createElement("td"));
    }
    rowElements.set(row.index, tr);
    els.rows.appendChild(tr);
  }

  tr.className = row.status;
  tr.cells[0].textContent = value(row.record, "ΑΜ/ΑΦΜ");
  tr.cells[1].textContent = value(row.record, "ΣΧΟΛΕΙΟ");
  tr.cells[2].textContent = value(row.record, "ΤΟΠΟΘΕΤΗΣΗ");
  tr.cells[3].className = "status";
  tr.cells[3].textContent = row.error
    ? `${statusLabels[row.status]}: ${row.error}`
    : statusLabels[row.status];
  tr.cells[3].title = row.error ?? "";

  if (row.screenshot) {
    setScreenshot(row.index, row.screenshot);
  }

  els.empty.classList.toggle("hidden", rowElements.size > 0);
  updateCounts();
}

function clearRows(rows: RowInfo[]): void {
  rowElements.clear();
  els.rows.replaceChildren();
  els.empty.classList.toggle("hidden", rows.length > 0);
  for (const row of rows) {
    renderRow(row);
  }
  updateCounts();
}

function updateCounts(): void {
  let ok = 0;
  let errors = 0;
  let processing = false;

  rowElements.forEach((tr) => {
    if (tr.classList.contains("ok")) ok++;
    else if (tr.classList.contains("error")) errors++;
    else if (tr.classList.contains("processing")) processing = true;
  });

  const total = rowElements.size;
  if (total === 0) {
    els.counts.textContent = "";
    return;
  }

  const parts = [`${ok} / ${total}`];
  if (errors) parts.push(`${errors} σφάλμ${errors === 1 ? "α" : "ατα"}`);
  if (processing) parts.push("επεξεργασία…");
  els.counts.textContent = parts.join(" · ");
}

/* ---------------- Καταγραφή ---------------- */

function appendLog(level: string, text: string, time: number): void {
  const entry = document.createElement("div");
  entry.className = "log " + level;

  const timeEl = document.createElement("span");
  timeEl.className = "time";
  timeEl.textContent = formatTime(time);

  const textEl = document.createElement("span");
  textEl.className = "text";
  textEl.textContent = text;

  entry.appendChild(timeEl);
  entry.appendChild(textEl);
  els.logPane.appendChild(entry);

  while (els.logPane.childElementCount > MAX_LOG_NODES) {
    els.logPane.firstElementChild?.remove();
  }

  if (els.autoscroll.checked) {
    els.logPane.scrollTop = els.logPane.scrollHeight;
  }
}

function clearLogs(): void {
  els.logPane.replaceChildren();
}

/* ---------------- Ζωντανή προβολή ---------------- */

function showFrame(data: string): void {
  els.frame.src = "data:image/jpeg;base64," + data;
  if (!els.frame.classList.contains("visible")) {
    els.frame.classList.add("visible");
    els.placeholder.classList.add("hidden");
  }
}

/* ---------------- Μηνύματα από τον διακομιστή ---------------- */

function applySnapshot(snapshot: Snapshot): void {
  clearLogs();
  for (const log of snapshot.logs) {
    appendLog(log.level, log.text, log.time);
  }
  clearRows(snapshot.rows);
  setState(snapshot.state, snapshot.message);
}

function handle(event: ServerEvent | Snapshot): void {
  switch (event.type) {
    case "snapshot":
      applySnapshot(event);
      break;
    case "log":
      appendLog(event.level, event.text, event.time);
      break;
    case "state":
      setState(event.state, event.message);
      break;
    case "reset":
      clearRows(event.rows);
      break;
    case "row":
      renderRow(event.row);
      break;
    case "screenshot":
      setScreenshot(event.index, event.file);
      break;
    case "frame":
      showFrame(event.data);
      break;
  }
}

/* ---------------- Σύνδεση web socket ---------------- */

let socket: WebSocket | null = null;

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://${location.host}/ws`);
  socket = ws;

  ws.onopen = () => {
    els.conn.className = "conn on";
    els.conn.title = "Συνδεδεμένος με τον διακομιστή";
  };

  ws.onmessage = (message) => {
    try {
      handle(JSON.parse(message.data));
    } catch (err) {
      console.error("Μη αναγνώρισιμο μήνυμα από τον διακομιστή", err);
    }
  };

  ws.onclose = () => {
    els.conn.className = "conn off";
    els.conn.title = "Αποσυνδεδεμένος — νέα προσπάθεια…";
    if (socket === ws) {
      setTimeout(connect, 1500);
    }
  };

  ws.onerror = () => {
    ws.close();
  };
}

/* ---------------- Αρχείο xlsx ---------------- */

type FileStatusKind = "idle" | "ok" | "error" | "pending";

function setFileStatus(text: string, kind: FileStatusKind): void {
  els.fileStatus.textContent = text;
  els.fileStatus.className = "file-status " + kind;
}

type XlsxState = {
  selected: boolean;
  name?: string;
  rowCount?: number;
  /** Υπάρχει το file.xlsx της ρίζας (συμπεριφορά της ανάπτυξης) */
  fallback: boolean;
};

function renderFileState(state: XlsxState): void {
  if (state.selected) {
    setFileStatus(
      `✓ «${state.name}» — ${state.rowCount} γραμμές, όλες οι απαιτούμενες στήλες`,
      "ok",
    );
    return;
  }
  if (state.fallback) {
    setFileStatus("Θα χρησιμοποιηθεί το file.xlsx", "idle");
    return;
  }
  setFileStatus("Δεν έχει επιλεγεί αρχείο", "idle");
}

async function loadFileState(): Promise<void> {
  try {
    const response = await fetch("/api/xlsx");
    if (!response.ok) return;
    renderFileState((await response.json()) as XlsxState);
  } catch {
    // Η σύνδεση θα επανέλθει μόνη της
  }
}

async function loadTemplateAccess(): Promise<void> {
  try {
    const response = await fetch("/api/template");
    if (!response.ok) return;
    const info = (await response.json()) as { desktop: boolean };
    els.templateDownload.hidden = info.desktop;
    els.templateOpen.hidden = !info.desktop;
  } catch {
    // Η σύνδεση θα επανέλθει μόνη της
  }
}

async function uploadXlsx(file: File): Promise<void> {
  setFileStatus("Ανάγνωση του αρχείου…", "pending");
  try {
    const response = await fetch(
      `/api/xlsx?name=${encodeURIComponent(file.name)}`,
      {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/octet-stream" },
      },
    );
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      name?: string;
      rowCount?: number;
    } | null;

    if (!response.ok || !body?.ok) {
      setFileStatus(
        "✗ " + (body?.error ?? "Αποτυχία ανάγνωσης αρχείου"),
        "error",
      );
      return;
    }
    setFileStatus(
      `✓ «${body.name}» — ${body.rowCount} γραμμές, όλες οι απαιτούμενες στήλες`,
      "ok",
    );
  } catch {
    setFileStatus("✗ Δεν υπάρχει σύνδεση με τον διακομιστή", "error");
  }
}

function selectXlsxFile(file: File): void {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    setFileStatus("✗ Επιτρέπονται αρχεία .xlsx", "error");
    return;
  }
  void uploadXlsx(file);
}

els.btnFile.addEventListener("click", () => els.fileInput.click());

els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files?.[0];
  if (file) {
    selectXlsxFile(file);
  }
  // Επιτρέπει την επιλογή του ίδιου αρχείου ξανά μετά από αποτυχία
  els.fileInput.value = "";
});

let fileDragDepth = 0;

els.filePicker.addEventListener("dragenter", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  fileDragDepth++;
  els.filePicker.classList.add("drag-over");
});

els.filePicker.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

els.filePicker.addEventListener("dragleave", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  fileDragDepth = Math.max(0, fileDragDepth - 1);
  if (fileDragDepth === 0) {
    els.filePicker.classList.remove("drag-over");
  }
});

els.filePicker.addEventListener("drop", (event) => {
  event.preventDefault();
  fileDragDepth = 0;
  els.filePicker.classList.remove("drag-over");
  const file = event.dataTransfer?.files[0];
  if (file) {
    selectXlsxFile(file);
  }
});

/* ---------------- Ρυθμίσεις ---------------- */

type SettingsInfo = {
  username: string;
  hasPassword: boolean;
  source: "settings" | "env" | "none";
  encryption: "os-keychain" | "plain";
  path?: string;
};

const sourceLabels: Record<SettingsInfo["source"], string> = {
  settings: "Αποθηκευμένα στις ρυθμίσεις",
  env: "Προέρχονται από το αρχείο .env",
  none: "Δεν έχουν οριστεί στοιχεία σύνδεσης",
};

function renderSettings(info: SettingsInfo): void {
  els.setUsername.value = info.username;
  els.setPassword.value = "";
  els.setPassword.placeholder = info.hasPassword
    ? "Άφησέ το κενό για να μην αλλάξει"
    : "Συμπλήρωσε τον κωδικό";

  const parts = [sourceLabels[info.source]];
  if (info.source === "settings") {
    parts.push(
      info.encryption === "os-keychain"
        ? "κρυπτογραφημένα στη κλειδοθήκη του συστήματος"
        : "απλό κείμενο (δεν βρέθηκε κλειδοθήκης)",
    );
  }
  if (info.path) {
    parts.push(info.path);
  }
  els.settingsHint.textContent = parts.join(" · ");
}

async function loadSettings(): Promise<void> {
  try {
    const response = await fetch("/api/settings");
    if (!response.ok) return;
    renderSettings((await response.json()) as SettingsInfo);
  } catch {
    // Η σύνδεση θα επανέλθει μόνη της
  }
}

type PreferencesInfo = {
  debugShowAutomation: boolean;
};

async function loadPreferences(): Promise<void> {
  try {
    const response = await fetch("/api/preferences");
    if (!response.ok) return;
    const preferences = (await response.json()) as PreferencesInfo;
    els.setDebugWindow.checked = preferences.debugShowAutomation;
  } catch {
    // Η σύνδεση θα επανέλθει μόνη της
  }
}

function showSettingsError(message: string): void {
  els.settingsError.textContent = message;
  els.settingsError.classList.toggle("hidden", !message);
}

els.btnSettings.addEventListener("click", () => {
  showSettingsError("");
  void Promise.all([loadSettings(), loadPreferences()]).then(() =>
    els.settingsDialog.showModal(),
  );
});

els.settingsCancel.addEventListener("click", () => {
  els.settingsDialog.close();
});

els.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showSettingsError("");
  void fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: els.setUsername.value,
      password: els.setPassword.value,
    }),
  })
    .then(async (response) => {
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        info?: SettingsInfo;
      } | null;
      if (!response.ok || !body?.ok) {
        showSettingsError(body?.error ?? "Αποτυχία αποθήκευσης");
        return;
      }

      // Προτιμήσεις (debug) — μόλις αποθηκευτούν σωστά τα στοιχεία
      const preferencesResponse = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          debugShowAutomation: els.setDebugWindow.checked,
        }),
      });
      if (!preferencesResponse.ok) {
        showSettingsError("Αποτυχία αποθήκευσης των προτιμήσεων");
        return;
      }

      if (body.info) {
        renderSettings(body.info);
      }
      els.settingsDialog.close();
    })
    .catch(() => showSettingsError("Δεν υπάρχει σύνδεση με τον διακομιστή"));
});

// Το Esc κλείνει το παράθυρο χωρίς αποθήκευση
els.settingsDialog.addEventListener("cancel", () => showSettingsError(""));

/* ---------------- Ενέργειες ---------------- */

async function post(url: string): Promise<void> {
  try {
    const response = await fetch(url, { method: "POST" });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      alert(body?.error ?? "Αποτυχία ενέργειας");
    }
  } catch {
    alert("Δεν υπάρχει σύνδεση με τον διακομιστή");
  }
}

els.run.addEventListener("click", () => {
  void post("/api/run");
});

els.stop.addEventListener("click", () => {
  if (confirm("Σίγουρα θέλεις να διακοπεί η εργασία;")) {
    void post("/api/stop");
  }
});

els.clear.addEventListener("click", clearLogs);
els.templateOpen.addEventListener("click", () => {
  void post("/api/template/open");
});

// Φόρτωσε την τρέχουσα κατάσταση (ρυθμίσεις και επιλεγμένο αρχείο)
void loadSettings();
void loadFileState();
void loadTemplateAccess();

connect();
