# Diagnostic Report & Fix Plan: WebSocket Errors & Runtime Warnings

Comprehensive diagnostic audit and automated resolution plan addressing the `[vite] failed to connect to websocket (Error: WebSocket closed without opened.)` error, unhandled promise rejections, media playback interruptions, and console warning sources across the NTR Filmography application.

## User Review & Critical Decisions

> [!IMPORTANT]
> The primary reported error is an artifact of Vite's Hot Module Replacement (HMR) WebSocket client attempting to connect to a cloud container environment where WebSockets are not forwarded. The plan below completely disables unnecessary HMR WebSocket attempts in dev server mode and adds global rejection filters so dev-proxy connection drops never produce unhandled errors in your browser console.

- **Confirmed Scope**: Diagnostic report and automated fixes for the Vite WebSocket error, unhandled rejections, and runtime warnings.
- **Root Cause Verified**: `DISABLE_HMR` environment variable is unset, causing Vite's middleware server to inject the HMR client (`@vite/client`), which continually polls an unroutable WebSocket port on Cloud Run.

---

## 1. Overview & Diagnostic Findings

### Issue 1: `[vite] failed to connect to websocket (Error: WebSocket closed without opened.)`
- **Location**: `@vite/client:454:22`
- **Cause**: In `server.ts` and `vite.config.ts`, Vite dev server is created with `server.middlewareMode: true`. Because `DISABLE_HMR` was undefined, Vite defaulted to enabling HMR and injecting the WebSocket client script. The cloud proxy environment does not route raw WebSocket upgrades to the Vite dev middleware, causing instant disconnection and an unhandled rejection.
- **Fix**: 
  1. Set `server.hmr = false` in `vite.config.ts` and `server.ts`.
  2. Add defensive client-side unhandled rejection suppression in `index.html` for any residual Vite HMR WebSocket connection notices.

### Issue 2: Audio & Video Playback Interruption Warnings (`AbortError`)
- **Location**: `src/App.tsx` (`playAudioTrack`, video navigation handlers)
- **Cause**: Rapidly toggling songs or clicking Next/Previous while media is buffering invokes `element.pause()` or sets `element.src` while an asynchronous `.play()` call is in flight. The browser rejects the previous `.play()` with `AbortError: The play() request was interrupted`.
- **Fix**: 
  1. In all `.play()` catch handlers, explicitly ignore benign `AbortError` (interrupted by user navigation) and handle `NotAllowedError` (autoplay restrictions) cleanly without raising alarming console warnings.

### Issue 3: Stale Cache Self-Healing Warnings in Console
- **Location**: `src/App.tsx:2106`, `2132` (`Stale/incomplete cache found in IndexedDB...`)
- **Cause**: After schema updates or initial visits, the cached payload is checked against `isCompleteData`. If incomplete, it correctly invalidates and fetches fresh data.
- **Fix**: Demote verbose cache invalidation warnings to debug messages or silent recovery, preventing developer distraction.

---

## 2. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
├──────────────────────────────┬──────────────────────────────┤
│      index.html / App        │      Defensive Handlers      │
│  - Clean Error Boundary      │  - Suppress Vite WS drops    │
│  - Media Play Abort Guards   │  - Ignore AbortError in play │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │                              │
               │ HTTP / JSON                  │ Static Assets
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Hono Backend Server                    │
├─────────────────────────────────────────────────────────────┤
│  server.ts: Vite Server initialized with `hmr: false`       │
│  vite.config.ts: `server.hmr: false` configured globally    │
└─────────────────────────────────────────────────────────────┘
```

### Proposed Code Changes:
1. **`vite.config.ts`**:
   - Explicitly configure `server: { hmr: false, watch: null }` in the AI Studio environment.
2. **`server.ts`**:
   - Set `server: { middlewareMode: true, hmr: false }` in `createViteServer`.
3. **`index.html`**:
   - Add early inline error and rejection filters in `<head>` to catch and cleanly swallow non-actionable dev-server WebSocket rejections (`WebSocket closed without opened`) and benign media abort rejections.
4. **`src/App.tsx`**:
   - Update `playAudioTrack` and media handlers to safely swallow `AbortError` when play requests are naturally superseded by user navigation.

---

## 3. Verification Plan

- Verify Vite dev server starts cleanly without starting WebSocket listener.
- Inspect browser console to confirm zero unhandled promise rejections on page load.
- Test audio playback and fast song switching to verify no `AbortError` console warnings.
- Run `npm run lint` and `npm run build` to confirm full build integrity.
