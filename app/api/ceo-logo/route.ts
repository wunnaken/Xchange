import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CLEARBIT_BASE = "https://logo.clearbit.com";

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return new NextResponse("Missing or invalid domain", { status: 400 });
  }
  try {
    const res = await fetch(`${CLEARBIT_BASE}/${domain}`, {
      headers: { "User-Agent": "Xchange/1.0" },
      cache: "force-cache",
      next: { revalidate: 86400 },
    });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const contentType = res.headers.get("content-type") ?? "image/png";
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
