"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getFinnhubWS } from "./finnhub-websocket";

export interface PriceData {
  price: number;
  change: number;
  changePercent: number;
}

export type WebSocketConnectionState = "connected" | "connecting" | "disconnected";

interface PriceContextType {
  getPrice: (symbol: string) => PriceData | null;
  subscribeToPrice: (symbol: string, callback: (data: PriceData) => void) => () => void;
  isConnected: boolean;
  connectionState: WebSocketConnectionState;
}

const PriceContext = createContext<PriceContextType | null>(null);

export function PriceProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>("disconnected");

  useEffect(() => {
    const ws = getFinnhubWS();
    if (!ws) return;
    const unsub = ws.onConnectionChange(setConnectionState);
    return unsub;
  }, []);

  const isConnected = connectionState === "connected";

  const subscribeToPrice = useCallback((symbol: string, callback: (data: PriceData) => void) => {
    const ws = getFinnhubWS();
    if (!ws) return () => {};
    return ws.onPrice(symbol, (price, change, changePercent) => {
      callback({ price, change, changePercent });
    });
  }, []);

  const getPrice = useCallback((symbol: string): PriceData | null => {
    const ws = getFinnhubWS();
    if (!ws) return null;
    const data = ws.getPrice(symbol);
    if (!data) return null;
    return {
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
    };
  }, []);

  return (
    <PriceContext.Provider value={{ getPrice, subscribeToPrice, isConnected, connectionState }}>
      {children}
    </PriceContext.Provider>
  );
}

export function usePriceContext(): PriceContextType {
  const context = useContext(PriceContext);
  if (!context) {
    return {
      getPrice: () => null,
      subscribeToPrice: () => () => {},
      isConnected: false,
      connectionState: "disconnected" as const,
    };
  }
  return context;
}
