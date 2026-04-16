const DEFAULT_BRIDGE_PORT = 58337;

/** Map the page's HTTP(S) protocol to its matching WebSocket variant. */
function wsProtocolFor(pageProtocol: string): "ws:" | "wss:" {
  return pageProtocol === "https:" ? "wss:" : "ws:";
}

/**
 * Build a URL that points back to the current page's origin.
 * In dev mode, Vite proxies /api and /ws to the bridge,
 * so the browser only ever needs to talk to the frontend port.
 */
export function getDefaultBridgeUrl(): string {
  if (typeof window === "undefined") {
    return `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`;
  }
  // Use the SAME host:port as the page — Vite proxy handles the rest
  const page = new URL(window.location.href);
  return `${page.protocol}//${page.host}`;
}

export function normalizeBridgeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return getDefaultBridgeUrl();
  }

  // Prepend "http://" when the input has no scheme so the WHATWG URL
  // parser treats it as a special URL. Without this, user-typed inputs
  // like "localhost:8080" parse as an opaque-path URL with
  // `protocol: "localhost:"`, and the scheme/port/pathname setters below
  // are silent no-ops per the spec. That silently stored a malformed URL
  // the rest of the app then tried to fetch from. Detect the scheme with
  // a narrow `^[a-z][a-z0-9+.-]*://` so we don't double-prefix an input
  // that already has one.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  try {
    const normalized = new URL(withScheme);

    if (!normalized.port) {
      normalized.port = String(DEFAULT_BRIDGE_PORT);
    }

    if (normalized.protocol !== "http:" && normalized.protocol !== "https:") {
      normalized.protocol = "http:";
    }

    normalized.pathname = "";
    normalized.search = "";
    normalized.hash = "";

    return normalized.toString().replace(/\/$/, "");
  } catch {
    return getDefaultBridgeUrl();
  }
}

export function bridgeUrlToWebSocketUrl(bridgeUrl: string): string {
  const normalized = new URL(normalizeBridgeUrl(bridgeUrl));
  normalized.protocol = wsProtocolFor(normalized.protocol);
  normalized.pathname = "/ws";
  normalized.search = "";
  normalized.hash = "";
  return normalized.toString();
}
