import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 900;

const OPENSKY_URL = "https://opensky-network.org/api/states/all";
const NEWSDATA_URL = "https://newsdata.io/api/1/latest";
const BBC_WORLD_RSS_URL = "http://feeds.bbci.co.uk/news/world/rss.xml";
const MARKETWATCH_RSS_URL = "https://feeds.marketwatch.com/marketwatch/topstories";
const WORLD_BANK_PORT_URL =
  "https://api.worldbank.org/v2/country/all/indicator/IS.SHP.GOOD.TU?format=json&mrv=1&per_page=300";
const WORLD_BANK_TRADE_GDP_URL =
  "https://api.worldbank.org/v2/country/all/indicator/TG.VAL.TOTL.GD.ZS?format=json&mrv=1&per_page=300";

type FlightRow = (string | number | boolean | null)[];
type OpenSkyResponse = { time?: number; states?: FlightRow[] | null };
type RiskLevel = "high" | "medium" | "low";
type RouteChangeType = "opened" | "closed" | "disrupted" | "restored";
type NewsResult = {
  title?: string;
  source_id?: string;
  source_name?: string;
  pubDate?: string;
  link?: string;
  description?: string;
};
type WorldBankRow = {
  country?: { value?: string };
  date?: string;
  value?: number | null;
};

/** Permanent major shipping corridors (geographic facts). */
const SEA_CORRIDORS: [number, number][][] = [
  [[31.2, 121.5], [25.0, 140.0], [35.0, 175.0], [30.0, -150.0], [20.0, -157.0], [34.0, -118.2]],
  [[1.3, 103.8], [5.0, 80.0], [12.0, 45.0], [29.5, 32.5], [31.5, 32.3], [36.0, 14.0], [38.0, 10.0], [51.9, 4.5]],
  [[31.2, 121.5], [1.3, 103.8], [-8.0, 80.0], [-20.0, 60.0], [-34.0, 26.0], [-30.0, 5.0], [0.0, -5.0], [20.0, -15.0], [36.0, -8.0], [51.9, 4.5]],
  [[51.9, 4.5], [48.0, -10.0], [45.0, -20.0], [42.0, -30.0], [40.0, -40.0], [40.7, -74.0]],
  [[19.0, 72.8], [12.0, 60.0], [12.0, 45.0], [21.3, 39.1], [24.9, 55.0]],
  [[22.3, 114.2], [10.0, 110.0], [1.3, 103.8]],
  [[1.3, 103.8], [0.0, 110.0], [-10.0, 120.0], [-20.0, 130.0], [-33.9, 151.2]],
  [[51.9, 4.5], [20.0, -30.0], [0.0, -25.0], [-15.0, -35.0], [-23.5, -43.2]],
  [[24.9, 55.0], [22.0, 60.0], [16.0, 68.0], [19.0, 72.8]],
  [[51.9, 4.5], [44.0, 8.0], [38.0, 15.0], [33.0, 22.0], [31.0, 30.0], [30.1, 31.3]],
];

/** Top 15 ports by volume — coordinates fixed; volume from World Bank IS.SHP.GOOD.TU by country. */
const TOP_PORTS: { name: string; wbCountry: string; pos: [number, number] }[] = [
  { name: "Shanghai", wbCountry: "China", pos: [31.23, 121.47] },
  { name: "Singapore", wbCountry: "Singapore", pos: [1.29, 103.85] },
  { name: "Ningbo", wbCountry: "China", pos: [29.87, 121.55] },
  { name: "Shenzhen", wbCountry: "China", pos: [22.52, 114.05] },
  { name: "Guangzhou", wbCountry: "China", pos: [23.13, 113.26] },
  { name: "Busan", wbCountry: "Korea, Rep.", pos: [35.1, 129.04] },
  { name: "Qingdao", wbCountry: "China", pos: [36.07, 120.38] },
  { name: "Hong Kong", wbCountry: "Hong Kong SAR, China", pos: [22.32, 114.17] },
  { name: "Tianjin", wbCountry: "China", pos: [38.99, 117.7] },
  { name: "Rotterdam", wbCountry: "Netherlands", pos: [51.92, 4.48] },
  { name: "Dubai", wbCountry: "United Arab Emirates", pos: [25.01, 55.06] },
  { name: "Port Klang", wbCountry: "Malaysia", pos: [3.0, 101.39] },
  { name: "Antwerp", wbCountry: "Belgium", pos: [51.23, 4.42] },
  { name: "Xiamen", wbCountry: "China", pos: [24.48, 118.09] },
  { name: "Los Angeles", wbCountry: "United States", pos: [33.74, -118.27] },
];

/** Fallback if WB uses a different country label (e.g. Hong Kong). */
const WB_COUNTRY_ALIASES: Record<string, string[]> = {
  "Hong Kong SAR, China": ["Hong Kong", "China"],
  "Korea, Rep.": ["South Korea", "Korea"],
};

const CHOKEPOINTS = [
  { name: "Red Sea", pos: [14.0, 43.0] as [number, number], affected: "Asia–Europe shipping lanes", search: "Red Sea" },
  { name: "Black Sea", pos: [46.0, 32.0] as [number, number], affected: "Grain and energy exports", search: "Black Sea" },
  { name: "Taiwan Strait", pos: [24.5, 120.5] as [number, number], affected: "Semiconductor supply chain", search: "Taiwan Strait" },
  { name: "Strait of Hormuz", pos: [26.5, 56.5] as [number, number], affected: "Global oil supply", search: "Strait of Hormuz" },
  { name: "Panama Canal", pos: [9.1, -79.7] as [number, number], affected: "Americas–Asia transit", search: "Panama Canal" },
  { name: "Strait of Malacca", pos: [2.5, 101.5] as [number, number], affected: "Asia shipping", search: "Strait of Malacca" },
  { name: "Suez Canal", pos: [30.0, 32.5] as [number, number], affected: "Europe–Asia transit", search: "Suez Canal" },
  { name: "Bosphorus", pos: [41.0, 29.0] as [number, number], affected: "Black Sea access", search: "Bosphorus" },
];

type LandNeighbor = { wbA: string; wbB: string; route: [[number, number], [number, number]] };

const LAND_NEIGHBORS: LandNeighbor[] = [
  { wbA: "United States", wbB: "Mexico", route: [[27.53, -99.46], [25.68, -100.31]] },
  { wbA: "United States", wbB: "Canada", route: [[42.33, -83.05], [42.32, -83.03]] },
  { wbA: "China", wbB: "Russian Federation", route: [[50.25, 127.56], [50.28, 127.54]] },
  { wbA: "Germany", wbB: "Poland", route: [[52.52, 13.4], [52.23, 21.01]] },
  { wbA: "Germany", wbB: "France", route: [[48.78, 9.18], [48.86, 2.35]] },
  { wbA: "China", wbB: "Kazakhstan", route: [[43.9, 87.6], [43.24, 76.95]] },
  { wbA: "India", wbB: "Bangladesh", route: [[22.57, 88.36], [23.81, 90.41]] },
];

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse NewsData.io and other date strings (NewsData uses `YYYY-MM-DD HH:mm:ss`). */
function parseDate(value?: string): number {
  if (!value) return 0;
  const normalized = /\d{4}-\d{2}-\d{2} \d/.test(value) ? value.replace(" ", "T") : value;
  const t = new Date(normalized).getTime();
  return Number.isFinite(t) ? t : 0;
}

function inferChangeType(text: string): RouteChangeType {
  if (/(reopen|re-open|restore|resume)/i.test(text)) return "restored";
  if (/(close|closure|shut|halt|blockade)/i.test(text)) return "closed";
  if (/(open|opened|new lane|new route)/i.test(text)) return "opened";
  return "disrupted";
}

function normalizeWbCountry(s: string): string {
  return s
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countryRowMatches(rowCountry: string | undefined, target: string): boolean {
  if (!rowCountry) return false;
  const r = normalizeWbCountry(rowCountry);
  const t = normalizeWbCountry(target);
  if (r === t) return true;
  if (r.includes(t) || t.includes(r)) return true;
  const aliases = WB_COUNTRY_ALIASES[target];
  if (aliases?.some((a) => r.includes(normalizeWbCountry(a)))) return true;
  return false;
}

async function fetchNewsData(apiKey: string, q: string, size: number, logLabel?: string): Promise<NewsResult[]> {
  const label = logLabel ?? "combined";
  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      q,
      language: "en",
      size: String(size),
    });
    const res = await fetch(`${NEWSDATA_URL}?${params.toString()}`, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json()) as { status?: string; results?: NewsResult[]; message?: string };
    const results = data.status === "success" && Array.isArray(data.results) ? data.results : [];
    const first = results[0];
    console.log(`[trade-vessels] NewsData /latest — ${label}`, {
      httpStatus: res.status,
      ok: res.ok,
      apiStatus: data.status,
      message: data.message,
      resultCount: results.length,
      firstTitle: first?.title,
      firstPubDate: first?.pubDate,
    });
    if (!res.ok) return [];
    return results;
  } catch (e) {
    console.log(`[trade-vessels] NewsData /latest error — ${label}`, e);
    return [];
  }
}

const SHIPPING_NEWS_QUERY = "shipping trade route cargo major shipping lane";

const CHOKEPOINT_KEYWORDS: Record<string, string[]> = {
  "Red Sea": ["red sea", "houthi"],
  "Black Sea": ["black sea", "ukraine", "russia"],
  "Strait of Hormuz": ["hormuz", "iran", "tanker"],
  "Taiwan Strait": ["taiwan", "taiwan strait"],
  "Panama Canal": ["panama canal", "panama"],
  "Strait of Malacca": ["malacca", "strait of malacca"],
  "Suez Canal": ["suez"],
  Bosphorus: ["bosphorus", "turkey strait", "turkish strait", "turkish straits"],
};

type RiskZonePayload = {
  name: string;
  pos: [number, number];
  risk: RiskLevel;
  summary: string;
  affected: string;
  lastUpdated?: string;
  articleCount: number;
  recentArticles: Array<{ title: string; url: string; source: string }>;
};

function buildRiskZones(news: NewsResult[]): RiskZonePayload[] {
  return CHOKEPOINTS.map((c) => {
    const keywords = CHOKEPOINT_KEYWORDS[c.name] ?? [c.search.toLowerCase()];
    const matched = news
      .filter((n) => {
        const text = `${n.title ?? ""} ${n.description ?? ""}`.toLowerCase();
        return keywords.some((k) => text.includes(k));
      })
      .sort((a, b) => parseDate(b.pubDate) - parseDate(a.pubDate));

    const top = matched[0];
    const blob = `${top?.title ?? ""} ${top?.description ?? ""}`.trim().replace(/\s+/g, " ");
    const summary = blob.length > 200 ? `${blob.slice(0, 197)}...` : blob;
    const matchCount = matched.length;
    const risk: RiskLevel = matchCount >= 3 ? "high" : matchCount >= 1 ? "medium" : "low";
    const recentArticles = matched
      .slice(0, 3)
      .map((n) => ({
        title: (n.title ?? "Untitled").trim(),
        url: (n.link ?? "").trim(),
        source: n.source_name ?? n.source_id ?? "Unknown",
      }))
      .filter((a) => a.url.startsWith("http"));

    return {
      name: c.name,
      pos: c.pos,
      risk,
      summary: matchCount > 0 ? summary || `${c.name}: shipping watch` : "No recent disruption reports",
      affected: c.affected,
      lastUpdated: top?.pubDate,
      articleCount: matchCount,
      recentArticles,
    };
  });
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTagValue(itemXml: string, tag: "title" | "description" | "pubDate" | "link"): string {
  const cdataRe = new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>`, "is");
  const plainRe = new RegExp(`<${tag}>(.*?)<\\/${tag}>`, "is");
  const hit = itemXml.match(cdataRe)?.[1] ?? itemXml.match(plainRe)?.[1] ?? "";
  return decodeXmlEntities(stripXmlTags(hit));
}

function parseRssItems(xml: string, sourceName: string): NewsResult[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((itemXml) => {
      const title = extractTagValue(itemXml, "title");
      const description = extractTagValue(itemXml, "description");
      const pubDate = extractTagValue(itemXml, "pubDate");
      const link = extractTagValue(itemXml, "link");
      return {
        title,
        description,
        pubDate,
        link,
        source_name: sourceName,
      } satisfies NewsResult;
    })
    .filter((a) => a.title || a.description);
}

async function fetchRssFeed(url: string, sourceName: string): Promise<NewsResult[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRssItems(xml, sourceName);
    console.log(`[trade-vessels] RSS ${sourceName}`, { httpStatus: res.status, count: items.length });
    return items;
  } catch (e) {
    console.log(`[trade-vessels] RSS ${sourceName} error`, e);
    return [];
  }
}

async function fetchChokepointRssArticles(): Promise<NewsResult[]> {
  const [bbc, marketWatch] = await Promise.all([
    fetchRssFeed(BBC_WORLD_RSS_URL, "BBC"),
    fetchRssFeed(MARKETWATCH_RSS_URL, "MarketWatch"),
  ]);
  return [...bbc, ...marketWatch];
}

async function fetchOpenSkyFlights() {
  try {
    const res = await fetch(OPENSKY_URL, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok)
      return [] as Array<{
        callsign: string;
        lat: number;
        lon: number;
        altitude: number | null;
        velocity: number | null;
        heading: number | null;
      }>;
    const data = (await res.json()) as OpenSkyResponse;
    if (!Array.isArray(data.states)) return [];
    return data.states
      .filter((s) => {
        const callsign = (s[1] ?? "").toString().trim();
        const onGround = Boolean(s[8]);
        /* OpenSky state vector: [9] = velocity (m/s), [10] = true_track (deg from north). */
        const velocity = toNumber(s[9]) ?? 0;
        return callsign.length > 0 && !onGround && velocity > 150;
      })
      .slice(0, 120)
      .map((s) => ({
        callsign: (s[1] ?? "").toString().trim(),
        lat: toNumber(s[6]) ?? 0,
        lon: toNumber(s[5]) ?? 0,
        altitude: toNumber(s[7]),
        velocity: toNumber(s[9]),
        heading: toNumber(s[10]),
      }))
      .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon));
  } catch {
    return [];
  }
}

async function fetchWorldBankRows(url: string): Promise<WorldBankRow[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as [unknown, WorldBankRow[]?];
    return Array.isArray(data?.[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

function findThroughputForPort(rows: WorldBankRow[], wbCountry: string): number | null {
  const tryNames = [wbCountry, ...(WB_COUNTRY_ALIASES[wbCountry] ?? [])];
  for (const name of tryNames) {
    const hit = rows.find((r) => countryRowMatches(r.country?.value, name) && r.value != null);
    if (hit?.value != null) return toNumber(hit.value);
  }
  return null;
}

function buildPortsLive(rows: WorldBankRow[]) {
  return TOP_PORTS.map((p) => {
    const raw = findThroughputForPort(rows, p.wbCountry);
    const vol =
      raw != null ? `${(raw / 1_000_000).toFixed(1)}M TEU (country)` : "— (WB)";
    return { name: p.name, pos: p.pos, volume: vol };
  });
}

function buildAirRouteCorridors(
  flights: Array<{
    callsign: string;
    lat: number;
    lon: number;
    altitude: number | null;
    velocity: number | null;
    heading: number | null;
  }>,
) {
  const cargoPrefixes = ["UPS", "FDX", "ABX", "GTI", "PAC", "CLX", "BOX", "MPH"];
  const cargoFlights = flights.filter((f) => cargoPrefixes.some((pr) => f.callsign.toUpperCase().startsWith(pr)));
  const clusters = new Map<string, Array<{ lat: number; lon: number }>>();
  cargoFlights.forEach((f) => {
    const key = `${Math.round(f.lat / 5)}:${Math.round(f.lon / 5)}`;
    const arr = clusters.get(key) ?? [];
    arr.push({ lat: f.lat, lon: f.lon });
    clusters.set(key, arr);
  });
  const centers = [...clusters.values()]
    .filter((v) => v.length > 0)
    .map((pts) => ({
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
    }))
    .slice(0, 16);
  const airRoutes: [number, number][][] = [];
  for (let i = 0; i < centers.length - 1; i++)
    airRoutes.push([
      [centers[i].lat, centers[i].lon],
      [centers[i + 1].lat, centers[i + 1].lon],
    ]);
  return airRoutes;
}

function topEconomyCountrySet(rows: WorldBankRow[], limit: number): Set<string> {
  const ranked = rows
    .filter((r) => r.country?.value && r.value != null)
    .sort((a, b) => (toNumber(b.value) ?? 0) - (toNumber(a.value) ?? 0))
    .slice(0, limit)
    .map((r) => r.country!.value!);
  return new Set(ranked.map((n) => normalizeWbCountry(n)));
}

function economiesMatch(set: Set<string>, wbName: string): boolean {
  const n = normalizeWbCountry(wbName);
  if (set.has(n)) return true;
  for (const x of set) {
    if (x.includes(n) || n.includes(x)) return true;
  }
  return false;
}

function buildLandRoutes(tradeRows: WorldBankRow[]): [number, number][][] {
  const top = topEconomyCountrySet(tradeRows, 40);
  const out: [number, number][][] = [];
  for (const pair of LAND_NEIGHBORS) {
    if (economiesMatch(top, pair.wbA) && economiesMatch(top, pair.wbB)) {
      out.push([pair.route[0], pair.route[1]]);
    }
  }
  return out;
}

function articleMatchesChokepoint(text: string, c: (typeof CHOKEPOINTS)[0]): boolean {
  const t = text.toLowerCase();
  const loc = c.search.toLowerCase();
  if (t.includes(loc.toLowerCase())) return true;
  const extras: Record<string, string[]> = {
    "Red Sea": ["houthi", "yemen", "bab el mandeb"],
    "Black Sea": ["ukraine", "odessa", "russia"],
    "Taiwan Strait": ["taiwan", "tsmc"],
    "Strait of Hormuz": ["hormuz", "iran", "gulf of oman"],
    "Panama Canal": ["panama"],
    "Strait of Malacca": ["malacca"],
    "Suez Canal": ["suez"],
    Bosphorus: ["bosphorus", "istanbul strait", "turkish straits"],
  };
  return (extras[c.name] ?? []).some((k) => t.includes(k));
}

function buildWeeklyChanges(news: NewsResult[]) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const recent = news.filter((n) => now - parseDate(n.pubDate) <= sevenDays);
  return recent.slice(0, 12).map((n) => {
    const text = `${n.title ?? ""} ${n.description ?? ""}`;
    const type = inferChangeType(text);
    const route =
      CHOKEPOINTS.find((c) => articleMatchesChokepoint(text.toLowerCase(), c))?.name ?? "Global Route";
    return { route, change: n.title ?? "Route update detected", type };
  });
}

function resolveNewsDataApiKey(): string {
  const candidates = [
    process.env.NEWSDATA_API_KEY,
    process.env.NEWS_DATA_API_KEY,
    process.env.NEXT_PUBLIC_NEWSDATA_KEY,
    process.env.NEWSDATA_KEY,
    process.env.NEWS_API_KEY,
  ];
  for (const v of candidates) {
    const t = v?.trim();
    if (t) return t;
  }
  console.log(
    "[trade-vessels] No NewsData API key found. Tried: NEWSDATA_API_KEY, NEWS_DATA_API_KEY, NEXT_PUBLIC_NEWSDATA_KEY, NEWSDATA_KEY, NEWS_API_KEY",
  );
  return "";
}

export async function GET() {
  const newsKey = resolveNewsDataApiKey();

  let flights: Awaited<ReturnType<typeof fetchOpenSkyFlights>> = [];
  let throughputRows: WorldBankRow[] = [];
  let tradeRows: WorldBankRow[] = [];
  let shippingNewsRaw: NewsResult[] = [];
  let chokepointNewsRaw: NewsResult[] = [];

  try {
    flights = await fetchOpenSkyFlights();
  } catch {
    flights = [];
  }
  try {
    throughputRows = await fetchWorldBankRows(WORLD_BANK_PORT_URL);
  } catch {
    throughputRows = [];
  }
  try {
    tradeRows = await fetchWorldBankRows(WORLD_BANK_TRADE_GDP_URL);
  } catch {
    tradeRows = [];
  }
  if (newsKey) {
    try {
      shippingNewsRaw = await fetchNewsData(newsKey, SHIPPING_NEWS_QUERY, 10, "shipping panel query");
    } catch {
      shippingNewsRaw = [];
    }
  }
  try {
    chokepointNewsRaw = await fetchChokepointRssArticles();
  } catch {
    chokepointNewsRaw = [];
  }

  const shippingNews = shippingNewsRaw
    .map((n) => ({
      title: n.title ?? "",
      source: n.source_name ?? n.source_id ?? "Unknown",
      publishedAt: n.pubDate ?? new Date().toISOString(),
      url: n.link ?? "",
    }))
    .filter((n) => n.title && n.url.startsWith("http"));

  const seaRoutes = SEA_CORRIDORS;
  const airRoutes = buildAirRouteCorridors(flights);
  const ports = buildPortsLive(throughputRows);
  const landRoutes = buildLandRoutes(tradeRows);
  const riskZones = buildRiskZones(chokepointNewsRaw);
  const weeklyChanges = buildWeeklyChanges(chokepointNewsRaw);

  return NextResponse.json({
    flights,
    shippingNews,
    seaRoutes,
    airRoutes,
    landRoutes,
    ports,
    riskZones,
    weeklyChanges,
  });
}
