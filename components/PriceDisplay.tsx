"use client";

import { useEffect, useRef, useState } from "react";

export type PriceDisplayProps = {
  price: number | null;
  change: number | null;
  changePercent: number | null;
  symbol?: string;
  /** "compact" = no decimals for large numbers, "full" = always show decimals */
  format?: "compact" | "full";
  className?: string;
  priceClassName?: string;
  changeClassName?: string;
  showChange?: boolean;
};

function formatPriceValue(price: number, symbol?: string): string {
  if (symbol === "BTC" || symbol === "ETH") {
    return price >= 1000 ? `${(price / 1000).toFixed(1)}k` : price.toFixed(0);
  }
  if (symbol === "EURUSD" || symbol === "DXY") return price.toFixed(4);
  return price >= 1 ? price.toFixed(2) : price.toFixed(4);
}

export function PriceDisplay({
  price,
  change,
  changePercent,
  symbol = "",
  format = "full",
  className = "",
  priceClassName = "",
  changeClassName = "",
  showChange = true,
}: PriceDisplayProps) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPriceRef = useRef<number | null>(null);

  useEffect(() => {
    if (price == null) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = price;
    if (prev != null && prev !== price) {
      setFlash(price > prev ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 500);
      return () => clearTimeout(t);
    }
  }, [price]);

  if (price == null && changePercent == null) {
    return <span className={className}>—</span>;
  }

  const isPositive = changePercent != null && changePercent >= 0;
  const isZero = changePercent != null && changePercent === 0;
  const flashClass = flash === "up" ? "price-flash-up" : flash === "down" ? "price-flash-down" : "";

  return (
    <span className={`inline-flex items-center gap-1 rounded transition-colors ${flashClass} ${className}`}>
      {price != null && (
        <span className={priceClassName}>
          ${format === "compact" ? formatPriceValue(price, symbol) : price >= 1 ? price.toFixed(2) : price.toFixed(4)}
        </span>
      )}
      {showChange && changePercent != null && (
        <>
          <span
            className={
              changeClassName ||
              (isZero ? "text-zinc-500" : isPositive ? "text-emerald-400" : "text-red-400")
            }
          >
            {isPositive ? "+" : ""}
            {changePercent.toFixed(2)}%
          </span>
        </>
      )}
    </span>
  );
}
