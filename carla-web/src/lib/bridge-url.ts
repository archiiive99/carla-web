const DEFAULT_BRIDGE_PORT = 58337;
const DEFAULT_SIGNALING_PORT = 58341;

/** Map the page's HTTP(S) protocol to its matching WebSocket variant. */
function wsProtocolFor(pageProtocol: string): "ws:" | "wss:" {
  return pageProtocol === "https:" ? "wss:" : "ws:";
}

/**
 * Build a URL that points back to the current page's origin.
 * In dev mode, Vite proxies /api and /ws to the bridge,
 * so the browser only ever needs to talk to the frontend port.
 */
function buildSameOriginUrl(protocol: "http:" | "ws:"): string {
  if (typeof window === "undefined") {
    return `${protocol}//127.0.0.1:${DEFAULT_BRIDGE_PORT}`;
  }

  const page = new URL(window.location.href);
  const resolvedProtocol = protocol === "ws:"
    ? wsProtocolFor(page.protocol)
    : page.protocol;

  // Use the SAME host:port as the page — Vite proxy handles the rest
  return `${resolvedProtocol}//${page.host}`;
}

export function getDefaultBridgeUrl(): string {
  return buildSameOriginUrl("http:");
}

export function getDefaultPixelStreamingUrl(): string {
  if (typeof window === "undefined") {
    return `ws://127.0.0.1:${DEFAULT_SIGNALING_PORT}`;
  }
  const page = new URL(window.location.href);
  return `${wsProtocolFor(page.protocol)}//${page.hostname}:${DEFAULT_SIGNALING_PORT}`;
}

export function normalizeBridgeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return getDefaultBridgeUrl();
  }

  try {
    const normalized = new URL(trimmed);

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
