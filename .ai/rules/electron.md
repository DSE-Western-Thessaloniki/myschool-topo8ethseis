# Electron Development Rules & Best Practices

You are an expert Electron, Node.js, and TypeScript developer. Follow these strict architectural, security, performance, and cross-platform guidelines for all code generation.

## 🔒 Security First (Non-Negotiable)

- **Context Isolation:** Always enable `contextIsolation: true` in `webPreferences`.
- **Sandbox:** Always enable `sandbox: true` for all renderers unless explicitly requested otherwise.
- **Node Integration:** Never enable `nodeIntegration: true` in the renderer process.
- **Preload Scripts:** Use preload scripts to expose specific, minimized APIs to the renderer via `contextBridge.exposeInMainWorld`. Never expose raw `ipcRenderer` or `remote` modules.
- **IPC Validation:** Always validate inputs, origins, and arguments in the Main process when receiving events from `ipcRenderer`. Never trust the renderer blindly.
- **Navigation & Permissions:** Explicitly handle `will-navigate`, `will-redirect`, and `permission-request` events to restrict unauthorized external URLs and capabilities.

## 🐧 Linux & Wayland Compatibility

- **Wayland Window Constraints:** Be aware that on Wayland (Linux), it is generally not possible to programmatically resize windows after creation, or to position, move, focus, or blur windows without user input.
- **Xwayland Fallback Flag:** If the application strictly requires programmatic window manipulation (resizing, positioning, moving, or forcing focus/blur), ensure the app forces Xwayland by appending the `--ozone-platform=x11` switch before the app is ready.
- **Implementation Pattern:** When initializing the main process, DON'T add a command line switch immediately before the `app.whenReady()` lifecycle event if running on Linux as shown below:
  ```typescript
  if (process.platform === "linux") {
    // Append the flag to allow programmatic window positioning/resizing
    app.commandLine.appendSwitch("ozone-platform", "x11");
  }
  ```
  This doesn't work and crashes the application.

## 🏗️ Architecture & Process Separation

- **Main Process:** Keep the Main process lightweight. Use it strictly for window management, native OS integration, and acting as a secure bridge.
- **Renderer Process:** Treat the renderer like a standard secure web app. Do not attempt to run heavy computational Node.js operations here.
- **IPC Communication:** Use `ipcRenderer.invoke` and `ipcMain.handle` (async/await via invoke/handle) instead of older `send`/`on` patterns for request-response actions.
- **TypeScript Types:** Define strict TypeScript interfaces for the `Window` object extension where the `contextBridge` APIs are injected.

## ⚡ Performance & Resource Management

- **Lazy Loading:** Do not require or import heavy Node.js modules until they are actually needed in code execution.
- **Memory Leaks:** Always clean up IPC listeners (`ipcMain.removeHandler` or `.removeAllListeners`) when windows or components are destroyed.
- **Power Management:** Suspend unnecessary background tasks when the application window is minimized or hidden.

## 🛠️ Code Style & Stack

- Use modern ES Modules / TypeScript syntax.
- Write explicit error handling around all IPC communications (wrap `ipcRenderer.invoke` in try/catch blocks).
- Ensure all native paths are handled via the `path` module (`path.join`, `path.resolve`) to guarantee cross-platform compatibility (Windows, macOS, Linux).
