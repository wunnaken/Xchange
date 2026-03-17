"use client";

import { useEffect, useState } from "react";
import { getFinnhubWS } from "../finnhub-websocket";

export interface LivePrice {
  price: number | null;
  change: number | null;
  changePercent: number | null;
  isLoading: boolean;
}

export function useLivePrice(symbol: string | null): LivePrice {
  const [data, setData] = useState<LivePrice>({
    price: null,
    change: null,
    changePercent: null,
    isLoading: true,
  });

  useEffect(() => {
    if (!symbol?.trim()) {
      setData({ price: null, change: null, changePercent: null, isLoading: false });
      return;
    }
    const sym = symbol.toUpperCase().trim();

    fetch(`/api/ticker-quote?ticker=${encodeURIComponent(sym)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((quote) => {
        const price = quote?.price ?? quote?.c ?? null;
        const change = quote?.change ?? quote?.d ?? 0;
        const changePercent = quote?.changePercent ?? quote?.dp ?? 0;
        const prevClose = quote?.previousClose ?? quote?.pc ?? price;
        const ws = getFinnhubWS();
        if (ws && prevClose != null && typeof prevClose === "number") {
          ws.setPrevClose(sym, prevClose);
        }
        setData({
          price: price != null ? price : null,
          change: change != null ? change : 0,
          changePercent: changePercent != null ? changePercent : 0,
          isLoading: false,
        });
      })
      .catch(() => {
        setData((prev) => ({ ...prev, isLoading: false }));
      });

    const ws = getFinnhubWS();
    if (!ws) return;

    const unsubscribe = ws.onPrice(sym, (price, change, changePercent) => {
      setData({
        price,
        change,
        changePercent,
        isLoading: false,
      });
    });

    return unsubscribe;
  }, [symbol]);

  return data;
}

export function useLivePrices(symbols: string[]): Record<string, LivePrice> {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const key = symbols.slice().sort().join(",");

  useEffect(() => {
    if (symbols.length === 0) return;

    const unique = [...new Set(symbols.map((s) => s.toUpperCase().trim()).filter(Boolean))];

    unique.forEach((symbol) => {
      setPrices((prev) => ({
        ...prev,
        [symbol]: {
          price: null,
          change: null,
          changePercent: null,
          isLoading: true,
        },
      }));
    });

    Promise.all(
      unique.map((symbol) =>
        fetch(`/api/ticker-quote?ticker=${encodeURIComponent(symbol)}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((quote) => ({ symbol, quote }))
          .catch(() => ({ symbol, quote: null }))
      )
    ).then((results) => {
      const ws = getFinnhubWS();
      results.forEach(({ symbol, quote }) => {
        const prevClose = quote?.previousClose ?? quote?.pc ?? quote?.price ?? quote?.c;
        if (quote && ws && prevClose != null && typeof prevClose === "number") {
          ws.setPrevClose(symbol, prevClose);
        }
        setPrices((prev) => ({
          ...prev,
          [symbol]: {
            price: quote?.price ?? quote?.c ?? null,
            change: quote?.change ?? quote?.d ?? 0,
            changePercent: quote?.changePercent ?? quote?.dp ?? 0,
            isLoading: false,
          },
        }));
      });
    });

    const ws = getFinnhubWS();
    if (!ws) return;

    const unsubscribers = unique.map((symbol) =>
      ws.onPrice(symbol, (price, change, changePercent) => {
        setPrices((prev) => ({
          ...prev,
          [symbol]: {
            price,
            change,
            changePercent,
            isLoading: false,
          },
        }));
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [key]);

  return prices;
}
