import { NextRequest, NextResponse } from "next/server";
import { getTokenServerSide } from "@/lib/auth";
import { fetchReportDownloadUrl } from "@/lib/api";

// Rewrites localhost/public-API origin to the internal backend hostname so
// server-side fetches reach the backend container (not the host machine).
function rewriteUpstreamUrl(rawUrl: string): string {
  const internalBase = process.env.API_URL_INTERNAL;
  if (!internalBase) return rawUrl;
  try {
    const target = new URL(rawUrl);
    const internal = new URL(internalBase);
    const publicBase = process.env.NEXT_PUBLIC_API_URL;
    const publicOrigin = publicBase ? new URL(publicBase).origin : null;
    const loopbackOrigins = new Set(["http://localhost:8000", "http://127.0.0.1:8000"]);
    if (loopbackOrigins.has(target.origin) || (publicOrigin && target.origin === publicOrigin)) {
      target.protocol = internal.protocol;
      target.username = internal.username;
      target.password = internal.password;
      target.host = internal.host;
      return target.toString();
    }
  } catch {
    return rawUrl;
  }
  return rawUrl;
}

// Returns true for S3 / any external URL that should NOT be proxied server-side.
// Proxying S3 incurs a server-side round-trip that can time out when the bucket
// is in a distant region; iframes navigate directly without CORS restrictions.
function isExternalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "backend";
  } catch {
    return false;
  }
}

function contentDisposition(filename: string, download: boolean) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${download ? "attachment" : "inline"}; filename="${safeFilename}"`;
}

function inferFilename(id: string, contentType: string | null) {
  return contentType?.includes("html") ? `report-${id}.html` : `report-${id}.pdf`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await context.params;
  const download = request.nextUrl.searchParams.get("download") === "1";

  const token = await getTokenServerSide();
  if (!token) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let downloadUrl: string;
  try {
    // For preview: request inline disposition so iframe can display without triggering
    // a browser download prompt. For the download button: use default (attachment).
    const result = await fetchReportDownloadUrl(token, resolvedParams.id, true, !download);
    downloadUrl = result.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve report file.";
    return NextResponse.json({ detail: message }, { status: 502 });
  }

  const upstreamUrl = rewriteUpstreamUrl(downloadUrl);

  if (isExternalUrl(upstreamUrl)) {
    if (download) {
      // Browser navigates directly to S3 — handles the download without a server round-trip.
      return NextResponse.redirect(downloadUrl, { status: 307 });
    }
    // Preview: stream S3 body through Next.js — never buffers the full body (avoids
    // BodyTimeoutError from ap-southeast-2 latency) and keeps content same-origin
    // (avoids CSP frame-src blocking an external S3 URL in the iframe).
    // S3 content-type is reliable: _upload_to_s3 byte-sniffs at upload time.
    try {
      const upstream = await fetch(upstreamUrl, { cache: "no-store" });
      if (!upstream.ok) {
        return NextResponse.json({ detail: "Failed to load report." }, { status: 502 });
      }
      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      const filename = inferFilename(resolvedParams.id, contentType);
      const headers = new Headers();
      headers.set("content-type", contentType);
      headers.set("content-disposition", contentDisposition(filename, false));
      headers.set("cache-control", "no-store");
      return new NextResponse(upstream.body, { status: 200, headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load report.";
      return NextResponse.json({ detail: message }, { status: 502 });
    }
  }

  // Local file (served by FastAPI StaticFiles on the backend container) — proxy through Next.js.
  try {
    const response = await fetch(upstreamUrl, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ detail: "Failed to load report content." }, { status: 502 });
    }

    let arrayBuf: ArrayBuffer;
    try {
      arrayBuf = await response.arrayBuffer();
    } catch {
      return NextResponse.json({ detail: "Failed to read report content." }, { status: 502 });
    }

    // Sniff bytes — WeasyPrint fallback saves HTML with a .pdf key, so the upstream
    // content-type (based on extension) is unreliable for local files.
    const bytes = new Uint8Array(arrayBuf);
    const isPdf = bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    const contentType = isPdf ? "application/pdf" : "text/html; charset=utf-8";
    const filename = inferFilename(resolvedParams.id, contentType);
    const headers = new Headers();
    headers.set("content-type", contentType);
    headers.set("content-disposition", contentDisposition(filename, download));
    headers.set("cache-control", "no-store");
    headers.set("content-length", String(arrayBuf.byteLength));
    return new NextResponse(arrayBuf, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load report content.";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}

export async function HEAD(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await context.params;
  const token = await getTokenServerSide();
  if (!token) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  try {
    await fetchReportDownloadUrl(token, resolvedParams.id, true);
    return new NextResponse(null, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve report file.";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
