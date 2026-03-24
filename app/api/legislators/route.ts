import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type LegislatorEntry = {
  bioguide: string;
  name: string;
  party: "D" | "R" | "I";
  chamber: "House" | "Senate";
  state: string;
};

function parseLegislatorsYaml(yaml: string): LegislatorEntry[] {
  const blocks = yaml.split(/\n- id:\n/);
  const results: LegislatorEntry[] = [];

  for (const block of blocks.slice(1)) {
    const bioguide = /    bioguide: (\w+)/.exec(block)?.[1];
    if (!bioguide) continue;

    const officialFull = /    official_full: (.+)/.exec(block)?.[1]?.trim();
    const first = /    first: (.+)/.exec(block)?.[1]?.trim() ?? "";
    const last = /    last: (.+)/.exec(block)?.[1]?.trim() ?? "";
    const name = officialFull ?? `${first} ${last}`.trim();
    if (!name) continue;

    // Find the last term in the terms section
    const termsIdx = block.indexOf("  terms:\n");
    if (termsIdx === -1) continue;
    const termsText = block.slice(termsIdx);

    // Each term starts with "  - type: "
    const termParts = termsText.split(/  - type: /);
    const lastPart = termParts[termParts.length - 1] ?? "";

    const chamber = lastPart.startsWith("sen") ? "Senate" : "House";
    const state = /    state: (\w+)/.exec(lastPart)?.[1] ?? "US";
    const partyFull = /    party: (.+)/.exec(lastPart)?.[1]?.trim() ?? "Independent";
    const party: "D" | "R" | "I" = partyFull.startsWith("D")
      ? "D"
      : partyFull.startsWith("R")
      ? "R"
      : "I";

    results.push({ bioguide, name, party, chamber, state });
  }

  return results;
}

export async function GET() {
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml",
      {
        headers: { "User-Agent": "Xchange/1.0" },
        next: { revalidate: 86400 }, // cache 24h
      }
    );
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const yaml = await res.text();
    const legislators = parseLegislatorsYaml(yaml);
    return NextResponse.json(legislators);
  } catch (err) {
    console.error("[legislators]", err);
    return NextResponse.json([]);
  }
}
