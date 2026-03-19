/**
 * CEO Intelligence: 100+ company CEOs by sector.
 * id, name, company, ticker, sector, tenureStart, sentiment, marketCap (B), recentAlert
 */

export type CEOSentiment = "positive" | "neutral" | "negative";

export type CEOEntry = {
  id: string;
  name: string;
  company: string;
  ticker: string;
  sector: string;
  tenureStart: number;
  sentiment: CEOSentiment;
  marketCap: number;
  recentAlert: boolean;
  interimNames?: string[];
  coCeoNames?: string[];
};

export const CEO_SECTORS = [
  "Technology",
  "Finance",
  "Healthcare",
  "Energy",
  "Consumer",
  "Industrials",
  "Auto",
  "Crypto/Fintech",
] as const;

// TODO: Replace with CEO / Company Profile API
// Endpoint: Finnhub GET /stock/executive?symbol= or company profile API (executives, tenure); augment with news for recentAlert
// When: before launch
export const CEOS: CEOEntry[] = [
  // TECHNOLOGY (20)
  { id: "AAPL-Tim Cook", name: "Tim Cook", company: "Apple", ticker: "AAPL", sector: "Technology", tenureStart: 2011, sentiment: "positive", marketCap: 3500, recentAlert: false },
  { id: "MSFT-Satya Nadella", name: "Satya Nadella", company: "Microsoft", ticker: "MSFT", sector: "Technology", tenureStart: 2014, sentiment: "positive", marketCap: 3200, recentAlert: false },
  { id: "GOOGL-Sundar Pichai", name: "Sundar Pichai", company: "Alphabet", ticker: "GOOGL", sector: "Technology", tenureStart: 2015, sentiment: "neutral", marketCap: 2300, recentAlert: false },
  { id: "AMZN-Andy Jassy", name: "Andy Jassy", company: "Amazon", ticker: "AMZN", sector: "Technology", tenureStart: 2021, sentiment: "neutral", marketCap: 2000, recentAlert: false },
  { id: "META-Mark Zuckerberg", name: "Mark Zuckerberg", company: "Meta", ticker: "META", sector: "Technology", tenureStart: 2004, sentiment: "positive", marketCap: 1300, recentAlert: false },
  { id: "NVDA-Jensen Huang", name: "Jensen Huang", company: "NVIDIA", ticker: "NVDA", sector: "Technology", tenureStart: 1993, sentiment: "positive", marketCap: 3200, recentAlert: false },
  { id: "TSLA-Elon Musk", name: "Elon Musk", company: "Tesla", ticker: "TSLA", sector: "Technology", tenureStart: 2008, sentiment: "neutral", marketCap: 800, recentAlert: false },
  { id: "ORCL-Safra Catz", name: "Safra Catz", company: "Oracle", ticker: "ORCL", sector: "Technology", tenureStart: 2014, sentiment: "positive", marketCap: 400, recentAlert: false },
  { id: "CRM-Marc Benioff", name: "Marc Benioff", company: "Salesforce", ticker: "CRM", sector: "Technology", tenureStart: 1999, sentiment: "neutral", marketCap: 280, recentAlert: false },
  {
    id: "INTC-David Zinsner",
    name: "David Zinsner",
    company: "Intel",
    ticker: "INTC",
    sector: "Technology",
    tenureStart: 2024,
    sentiment: "neutral",
    marketCap: 180,
    recentAlert: false,
    interimNames: ["David Zinsner", "Michelle Johnston Holthaus"],
    coCeoNames: ["Michelle Johnston Holthaus"],
  },
  { id: "AMD-Lisa Su", name: "Lisa Su", company: "AMD", ticker: "AMD", sector: "Technology", tenureStart: 2014, sentiment: "positive", marketCap: 260, recentAlert: false },
  { id: "QCOM-Cristiano Amon", name: "Cristiano Amon", company: "Qualcomm", ticker: "QCOM", sector: "Technology", tenureStart: 2021, sentiment: "neutral", marketCap: 240, recentAlert: false },
  { id: "ADBE-Shantanu Narayen", name: "Shantanu Narayen", company: "Adobe", ticker: "ADBE", sector: "Technology", tenureStart: 2007, sentiment: "positive", marketCap: 220, recentAlert: false },
  { id: "NFLX-Ted Sarandos", name: "Ted Sarandos", company: "Netflix", ticker: "NFLX", sector: "Technology", tenureStart: 2020, sentiment: "neutral", marketCap: 280, recentAlert: false },
  { id: "SHOP-Tobias Lütke", name: "Tobias Lütke", company: "Shopify", ticker: "SHOP", sector: "Technology", tenureStart: 2006, sentiment: "positive", marketCap: 120, recentAlert: false },
  { id: "UBER-Dara Khosrowshahi", name: "Dara Khosrowshahi", company: "Uber", ticker: "UBER", sector: "Technology", tenureStart: 2017, sentiment: "neutral", marketCap: 180, recentAlert: false },
  { id: "LYFT-David Risher", name: "David Risher", company: "Lyft", ticker: "LYFT", sector: "Technology", tenureStart: 2023, sentiment: "neutral", marketCap: 7, recentAlert: true },
  { id: "SNAP-Evan Spiegel", name: "Evan Spiegel", company: "Snap", ticker: "SNAP", sector: "Technology", tenureStart: 2011, sentiment: "neutral", marketCap: 22, recentAlert: false },
  { id: "SPOT-Daniel Ek", name: "Daniel Ek", company: "Spotify", ticker: "SPOT", sector: "Technology", tenureStart: 2006, sentiment: "neutral", marketCap: 65, recentAlert: false },
  { id: "TWLO-Jeff Lawson", name: "Jeff Lawson", company: "Twilio", ticker: "TWLO", sector: "Technology", tenureStart: 2008, sentiment: "neutral", marketCap: 12, recentAlert: true },
  // FINANCE (15)
  { id: "JPM-Jamie Dimon", name: "Jamie Dimon", company: "JPMorgan Chase", ticker: "JPM", sector: "Finance", tenureStart: 2005, sentiment: "positive", marketCap: 580, recentAlert: false },
  { id: "BAC-Brian Moynihan", name: "Brian Moynihan", company: "Bank of America", ticker: "BAC", sector: "Finance", tenureStart: 2010, sentiment: "neutral", marketCap: 380, recentAlert: false },
  { id: "WFC-Charlie Scharf", name: "Charlie Scharf", company: "Wells Fargo", ticker: "WFC", sector: "Finance", tenureStart: 2019, sentiment: "neutral", marketCap: 210, recentAlert: false },
  { id: "GS-David Solomon", name: "David Solomon", company: "Goldman Sachs", ticker: "GS", sector: "Finance", tenureStart: 2018, sentiment: "neutral", marketCap: 150, recentAlert: false },
  { id: "MS-James Gorman", name: "James Gorman", company: "Morgan Stanley", ticker: "MS", sector: "Finance", tenureStart: 2010, sentiment: "positive", marketCap: 160, recentAlert: true },
  { id: "BLK-Larry Fink", name: "Larry Fink", company: "BlackRock", ticker: "BLK", sector: "Finance", tenureStart: 1988, sentiment: "neutral", marketCap: 120, recentAlert: false },
  { id: "V-Ryan McInerney", name: "Ryan McInerney", company: "Visa", ticker: "V", sector: "Finance", tenureStart: 2023, sentiment: "neutral", marketCap: 600, recentAlert: false },
  { id: "MA-Michael Miebach", name: "Michael Miebach", company: "Mastercard", ticker: "MA", sector: "Finance", tenureStart: 2021, sentiment: "neutral", marketCap: 450, recentAlert: false },
  { id: "AXP-Stephen Squeri", name: "Stephen Squeri", company: "American Express", ticker: "AXP", sector: "Finance", tenureStart: 2018, sentiment: "positive", marketCap: 170, recentAlert: false },
  { id: "BRK-Warren Buffett", name: "Warren Buffett", company: "Berkshire Hathaway", ticker: "BRK", sector: "Finance", tenureStart: 1965, sentiment: "positive", marketCap: 900, recentAlert: false },
  { id: "C-Jane Fraser", name: "Jane Fraser", company: "Citigroup", ticker: "C", sector: "Finance", tenureStart: 2021, sentiment: "neutral", marketCap: 120, recentAlert: false },
  { id: "USB-Andy Cecere", name: "Andy Cecere", company: "U.S. Bancorp", ticker: "USB", sector: "Finance", tenureStart: 2017, sentiment: "neutral", marketCap: 65, recentAlert: false },
  { id: "SCHW-Walter Bettinger", name: "Walter Bettinger", company: "Charles Schwab", ticker: "SCHW", sector: "Finance", tenureStart: 2008, sentiment: "neutral", marketCap: 140, recentAlert: false },
  { id: "COF-Richard Fairbank", name: "Richard Fairbank", company: "Capital One", ticker: "COF", sector: "Finance", tenureStart: 1994, sentiment: "neutral", marketCap: 55, recentAlert: false },
  { id: "PYPL-Alex Chriss", name: "Alex Chriss", company: "PayPal", ticker: "PYPL", sector: "Finance", tenureStart: 2023, sentiment: "neutral", marketCap: 75, recentAlert: true },
  // HEALTHCARE (12)
  { id: "JNJ-Joaquin Duato", name: "Joaquin Duato", company: "Johnson & Johnson", ticker: "JNJ", sector: "Healthcare", tenureStart: 2022, sentiment: "neutral", marketCap: 380, recentAlert: false },
  { id: "PFE-Albert Bourla", name: "Albert Bourla", company: "Pfizer", ticker: "PFE", sector: "Healthcare", tenureStart: 2019, sentiment: "neutral", marketCap: 160, recentAlert: false },
  { id: "UNH-Andrew Witty", name: "Andrew Witty", company: "UnitedHealth", ticker: "UNH", sector: "Healthcare", tenureStart: 2021, sentiment: "neutral", marketCap: 520, recentAlert: false },
  { id: "ABBV-Richard Gonzalez", name: "Richard Gonzalez", company: "AbbVie", ticker: "ABBV", sector: "Healthcare", tenureStart: 2013, sentiment: "positive", marketCap: 320, recentAlert: false },
  { id: "MRK-Robert Davis", name: "Robert Davis", company: "Merck", ticker: "MRK", sector: "Healthcare", tenureStart: 2021, sentiment: "neutral", marketCap: 330, recentAlert: false },
  { id: "LLY-David Ricks", name: "David Ricks", company: "Eli Lilly", ticker: "LLY", sector: "Healthcare", tenureStart: 2017, sentiment: "positive", marketCap: 780, recentAlert: false },
  { id: "BMY-Christopher Boerner", name: "Christopher Boerner", company: "Bristol-Myers Squibb", ticker: "BMY", sector: "Healthcare", tenureStart: 2023, sentiment: "neutral", marketCap: 105, recentAlert: true },
  { id: "AMGN-Robert Bradway", name: "Robert Bradway", company: "Amgen", ticker: "AMGN", sector: "Healthcare", tenureStart: 2012, sentiment: "neutral", marketCap: 165, recentAlert: false },
  { id: "CVS-Karen Lynch", name: "Karen Lynch", company: "CVS Health", ticker: "CVS", sector: "Healthcare", tenureStart: 2021, sentiment: "neutral", marketCap: 95, recentAlert: false },
  { id: "CI-David Cordani", name: "David Cordani", company: "Cigna", ticker: "CI", sector: "Healthcare", tenureStart: 2009, sentiment: "neutral", marketCap: 105, recentAlert: false },
  { id: "HUM-Bruce Broussard", name: "Bruce Broussard", company: "Humana", ticker: "HUM", sector: "Healthcare", tenureStart: 2013, sentiment: "neutral", marketCap: 48, recentAlert: false },
  { id: "ISRG-Gary Guthart", name: "Gary Guthart", company: "Intuitive Surgical", ticker: "ISRG", sector: "Healthcare", tenureStart: 2010, sentiment: "positive", marketCap: 150, recentAlert: false },
  // ENERGY (10)
  { id: "XOM-Darren Woods", name: "Darren Woods", company: "Exxon Mobil", ticker: "XOM", sector: "Energy", tenureStart: 2017, sentiment: "neutral", marketCap: 520, recentAlert: false },
  { id: "CVX-Mike Wirth", name: "Mike Wirth", company: "Chevron", ticker: "CVX", sector: "Energy", tenureStart: 2018, sentiment: "neutral", marketCap: 290, recentAlert: false },
  { id: "COP-Ryan Lance", name: "Ryan Lance", company: "ConocoPhillips", ticker: "COP", sector: "Energy", tenureStart: 2012, sentiment: "neutral", marketCap: 150, recentAlert: false },
  { id: "SLB-Olivier Le Peuch", name: "Olivier Le Peuch", company: "Schlumberger", ticker: "SLB", sector: "Energy", tenureStart: 2019, sentiment: "neutral", marketCap: 85, recentAlert: false },
  { id: "EOG-Ezra Yacob", name: "Ezra Yacob", company: "EOG Resources", ticker: "EOG", sector: "Energy", tenureStart: 2013, sentiment: "neutral", marketCap: 75, recentAlert: false },
  { id: "PXD-Scott Sheffield", name: "Scott Sheffield", company: "Pioneer Natural Resources", ticker: "PXD", sector: "Energy", tenureStart: 1997, sentiment: "neutral", marketCap: 65, recentAlert: false },
  { id: "OXY-Vicki Hollub", name: "Vicki Hollub", company: "Occidental Petroleum", ticker: "OXY", sector: "Energy", tenureStart: 2016, sentiment: "neutral", marketCap: 55, recentAlert: false },
  { id: "HAL-Jeff Miller", name: "Jeff Miller", company: "Halliburton", ticker: "HAL", sector: "Energy", tenureStart: 2017, sentiment: "neutral", marketCap: 35, recentAlert: false },
  { id: "BKR-Lorenzo Simonelli", name: "Lorenzo Simonelli", company: "Baker Hughes", ticker: "BKR", sector: "Energy", tenureStart: 2017, sentiment: "neutral", marketCap: 35, recentAlert: false },
  { id: "MPC-Michael Hennigan", name: "Michael Hennigan", company: "Marathon Petroleum", ticker: "MPC", sector: "Energy", tenureStart: 2021, sentiment: "neutral", marketCap: 68, recentAlert: false },
  // CONSUMER (12)
  { id: "WMT-Doug McMillon", name: "Doug McMillon", company: "Walmart", ticker: "WMT", sector: "Consumer", tenureStart: 2014, sentiment: "positive", marketCap: 520, recentAlert: false },
  { id: "TGT-Brian Cornell", name: "Brian Cornell", company: "Target", ticker: "TGT", sector: "Consumer", tenureStart: 2014, sentiment: "neutral", marketCap: 75, recentAlert: false },
  { id: "COST-Ron Vachris", name: "Ron Vachris", company: "Costco", ticker: "COST", sector: "Consumer", tenureStart: 2024, sentiment: "neutral", marketCap: 400, recentAlert: true },
  { id: "MCD-Chris Kempczinski", name: "Chris Kempczinski", company: "McDonald's", ticker: "MCD", sector: "Consumer", tenureStart: 2019, sentiment: "neutral", marketCap: 220, recentAlert: false },
  { id: "SBUX-Brian Niccol", name: "Brian Niccol", company: "Starbucks", ticker: "SBUX", sector: "Consumer", tenureStart: 2024, sentiment: "neutral", marketCap: 105, recentAlert: false },
  { id: "NKE-John Donahoe", name: "John Donahoe", company: "Nike", ticker: "NKE", sector: "Consumer", tenureStart: 2020, sentiment: "neutral", marketCap: 145, recentAlert: false },
  { id: "DIS-Bob Iger", name: "Bob Iger", company: "Disney", ticker: "DIS", sector: "Consumer", tenureStart: 2022, sentiment: "neutral", marketCap: 230, recentAlert: false },
  { id: "YUM-David Gibbs", name: "David Gibbs", company: "Yum! Brands", ticker: "YUM", sector: "Consumer", tenureStart: 2020, sentiment: "neutral", marketCap: 42, recentAlert: false },
  { id: "CMG-Brian Niccol", name: "Brian Niccol", company: "Chipotle", ticker: "CMG", sector: "Consumer", tenureStart: 2018, sentiment: "positive", marketCap: 95, recentAlert: false },
  { id: "LULU-Calvin McDonald", name: "Calvin McDonald", company: "Lululemon", ticker: "LULU", sector: "Consumer", tenureStart: 2018, sentiment: "positive", marketCap: 45, recentAlert: false },
  { id: "PG-Jon Moeller", name: "Jon Moeller", company: "Procter & Gamble", ticker: "PG", sector: "Consumer", tenureStart: 2021, sentiment: "neutral", marketCap: 400, recentAlert: false },
  { id: "KO-James Quincey", name: "James Quincey", company: "Coca-Cola", ticker: "KO", sector: "Consumer", tenureStart: 2017, sentiment: "neutral", marketCap: 265, recentAlert: false },
  // INDUSTRIALS (8)
  { id: "BA-Kelly Ortberg", name: "Kelly Ortberg", company: "Boeing", ticker: "BA", sector: "Industrials", tenureStart: 2024, sentiment: "neutral", marketCap: 120, recentAlert: true },
  { id: "CAT-Jim Umpleby", name: "Jim Umpleby", company: "Caterpillar", ticker: "CAT", sector: "Industrials", tenureStart: 2017, sentiment: "positive", marketCap: 185, recentAlert: false },
  { id: "GE-Larry Culp", name: "Larry Culp", company: "GE Aerospace", ticker: "GE", sector: "Industrials", tenureStart: 2018, sentiment: "positive", marketCap: 195, recentAlert: false },
  { id: "HON-Vimal Kapur", name: "Vimal Kapur", company: "Honeywell", ticker: "HON", sector: "Industrials", tenureStart: 2023, sentiment: "neutral", marketCap: 140, recentAlert: false },
  { id: "MMM-Mike Roman", name: "Mike Roman", company: "3M", ticker: "MMM", sector: "Industrials", tenureStart: 2018, sentiment: "neutral", marketCap: 55, recentAlert: false },
  { id: "UPS-Carol Tomé", name: "Carol Tomé", company: "UPS", ticker: "UPS", sector: "Industrials", tenureStart: 2020, sentiment: "neutral", marketCap: 135, recentAlert: false },
  { id: "FDX-Raj Subramaniam", name: "Raj Subramaniam", company: "FedEx", ticker: "FDX", sector: "Industrials", tenureStart: 2022, sentiment: "neutral", marketCap: 75, recentAlert: false },
  { id: "RTX-Greg Hayes", name: "Greg Hayes", company: "RTX", ticker: "RTX", sector: "Industrials", tenureStart: 2014, sentiment: "neutral", marketCap: 145, recentAlert: false },
  // AUTO (6)
  { id: "F-Jim Farley", name: "Jim Farley", company: "Ford", ticker: "F", sector: "Auto", tenureStart: 2020, sentiment: "neutral", marketCap: 48, recentAlert: false },
  { id: "GM-Mary Barra", name: "Mary Barra", company: "General Motors", ticker: "GM", sector: "Auto", tenureStart: 2014, sentiment: "positive", marketCap: 55, recentAlert: false },
  { id: "TM-Koji Sato", name: "Koji Sato", company: "Toyota", ticker: "TM", sector: "Auto", tenureStart: 2023, sentiment: "neutral", marketCap: 330, recentAlert: false },
  { id: "VWAGY-Oliver Blume", name: "Oliver Blume", company: "Volkswagen", ticker: "VWAGY", sector: "Auto", tenureStart: 2022, sentiment: "neutral", marketCap: 75, recentAlert: false },
  { id: "STLA-Carlos Tavares", name: "Carlos Tavares", company: "Stellantis", ticker: "STLA", sector: "Auto", tenureStart: 2021, sentiment: "neutral", marketCap: 95, recentAlert: false },
  { id: "HMC-Toshihiro Mibe", name: "Toshihiro Mibe", company: "Honda", ticker: "HMC", sector: "Auto", tenureStart: 2021, sentiment: "neutral", marketCap: 65, recentAlert: false },
  // CRYPTO/FINTECH (6)
  { id: "COIN-Brian Armstrong", name: "Brian Armstrong", company: "Coinbase", ticker: "COIN", sector: "Crypto/Fintech", tenureStart: 2012, sentiment: "neutral", marketCap: 65, recentAlert: false },
  { id: "SQ-Jack Dorsey", name: "Jack Dorsey", company: "Block", ticker: "SQ", sector: "Crypto/Fintech", tenureStart: 2009, sentiment: "neutral", marketCap: 45, recentAlert: false },
  { id: "HOOD-Vlad Tenev", name: "Vlad Tenev", company: "Robinhood", ticker: "HOOD", sector: "Crypto/Fintech", tenureStart: 2013, sentiment: "neutral", marketCap: 22, recentAlert: false },
  { id: "SOFI-Anthony Noto", name: "Anthony Noto", company: "SoFi", ticker: "SOFI", sector: "Crypto/Fintech", tenureStart: 2018, sentiment: "neutral", marketCap: 12, recentAlert: false },
  { id: "AFRM-Max Levchin", name: "Max Levchin", company: "Affirm", ticker: "AFRM", sector: "Crypto/Fintech", tenureStart: 2012, sentiment: "neutral", marketCap: 12, recentAlert: false },
  { id: "MSTR-Michael Saylor", name: "Michael Saylor", company: "MicroStrategy", ticker: "MSTR", sector: "Crypto/Fintech", tenureStart: 2000, sentiment: "neutral", marketCap: 28, recentAlert: false },
  // PELOTON (1)
  { id: "PTON-Chris Bruzzo", name: "Chris Bruzzo", company: "Peloton", ticker: "PTON", sector: "Consumer", tenureStart: 2024, sentiment: "neutral", marketCap: 12, recentAlert: false, coCeoNames: ["Chris Bruzzo"] },
];

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function nodeRadius(marketCap: number): number {
  if (marketCap >= 1000) return 26;
  if (marketCap >= 500) return 20;
  if (marketCap >= 200) return 16;
  if (marketCap >= 50) return 12;
  return 8;
}

export function sentimentColor(sentiment: CEOSentiment): string {
  switch (sentiment) {
    case "positive": return "#00C896";
    case "negative": return "#EF4444";
    default: return "#4B5563";
  }
}
