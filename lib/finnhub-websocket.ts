/**
 * Singleton Finnhub WebSocket manager. One connection for the whole app.
 * Uses NEXT_PUBLIC_FINNHUB_KEY (client-visible). Free tier: max 50 symbol subscriptions.
 */

type PriceCallback = (price: number, change: number, changePercent: number) => void;

function toFinnhubSymbol(symbol: string): string {
  const u = symbol.toUpperCase().trim();
  if (u === "BTC") return "BINANCE:BTCUSDT";
  if (u === "ETH") return "BINANCE:ETHUSDT";
  return u;
}

function fromFinnhubSymbol(finnhubSymbol: string): string {
  if (finnhubSymbol === "BINANCE:BTCUSDT") return "BTC";
  if (finnhubSymbol === "BINANCE:ETHUSDT") return "ETH";
  return finnhubSymbol;
}

type StoredPrice = {
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
};

export class FinnhubWebSocket {
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, Set<PriceCallback>>();
  private prices = new Map<string, StoredPrice>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string;
  private connectionListeners = new Set<(state: "connected" | "connecting" | "disconnected") => void>();
  private _connectionState: "connected" | "connecting" | "disconnected" = "disconnected";

  constructor(token: string) {
    this.token = token;
    this.connect();
  }

  get connectionState(): "connected" | "connecting" | "disconnected" {
    return this._connectionState;
  }

  get connected(): boolean {
    return this._connectionState === "connected";
  }

  onConnectionChange(cb: (state: "connected" | "connecting" | "disconnected") => void): () => void {
    this.connectionListeners.add(cb);
    cb(this._connectionState);
    return () => this.connectionListeners.delete(cb);
  }

  private setConnectionState(value: "connected" | "connecting" | "disconnected") {
    if (this._connectionState === value) return;
    this._connectionState = value;
    this.connectionListeners.forEach((cb) => cb(value));
  }

  private connect(): void {
    if (typeof WebSocket === "undefined") return;
    this.setConnectionState("connecting");
    this.ws = new WebSocket(`wss://ws.finnhub.io?token=${this.token}`);

    this.ws.onopen = () => {
      this.setConnectionState("connected");
      this.subscribers.forEach((_, appSymbol) => {
        const finnhubSymbol = toFinnhubSymbol(appSymbol);
        this.sendSubscribe(finnhubSymbol);
      });
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          data?: Array<{ s?: string; p?: number }>;
        };
        if (data.type === "trade" && Array.isArray(data.data)) {
          data.data.forEach((trade) => {
            const finnhubSymbol = trade.s;
            const price = trade.p;
            if (finnhubSymbol == null || price == null) return;
            const appSymbol = fromFinnhubSymbol(finnhubSymbol);
            const stored = this.prices.get(appSymbol);
            if (stored) {
              const change = price - stored.prevClose;
              const changePercent = stored.prevClose !== 0 ? (change / stored.prevClose) * 100 : 0;
              this.prices.set(appSymbol, {
                price,
                change,
                changePercent,
                prevClose: stored.prevClose,
              });
              const subs = this.subscribers.get(appSymbol);
              if (subs) {
                subs.forEach((cb) => cb(price, change, changePercent));
              }
            }
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.setConnectionState("disconnected");
      this.ws = null;
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private sendSubscribe(symbol: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", symbol }));
    }
  }

  private sendUnsubscribe(symbol: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", symbol }));
    }
  }

  subscribe(appSymbol: string): void {
    const finnhubSymbol = toFinnhubSymbol(appSymbol);
    this.sendSubscribe(finnhubSymbol);
  }

  unsubscribe(appSymbol: string): void {
    const finnhubSymbol = toFinnhubSymbol(appSymbol);
    this.sendUnsubscribe(finnhubSymbol);
    this.subscribers.delete(appSymbol);
  }

  setPrevClose(appSymbol: string, prevClose: number): void {
    const sym = appSymbol.toUpperCase().trim();
    const existing = this.prices.get(sym);
    this.prices.set(sym, {
      price: existing?.price ?? prevClose,
      change: existing?.change ?? 0,
      changePercent: existing?.changePercent ?? 0,
      prevClose,
    });
  }

  onPrice(appSymbol: string, callback: PriceCallback): () => void {
    const sym = appSymbol.toUpperCase().trim();
    if (!this.subscribers.has(sym)) {
      this.subscribers.set(sym, new Set());
      this.subscribe(sym);
    }
    this.subscribers.get(sym)!.add(callback);

    return () => {
      const subs = this.subscribers.get(sym);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.unsubscribe(sym);
        }
      }
    };
  }

  getPrice(appSymbol: string): StoredPrice | undefined {
    return this.prices.get(appSymbol.toUpperCase().trim());
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setConnectionState("disconnected");
  }
}

let instance: FinnhubWebSocket | null = null;

export function getFinnhubWS(): FinnhubWebSocket | null {
  if (typeof window === "undefined") return null;
  if (!instance) {
    const token = process.env.NEXT_PUBLIC_FINNHUB_KEY?.trim();
    if (!token) return null;
    instance = new FinnhubWebSocket(token);
  }
  return instance;
}

export default FinnhubWebSocket;
