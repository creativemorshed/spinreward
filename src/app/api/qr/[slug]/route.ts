import QRCode from "qrcode";

export const runtime = "nodejs";

type Params = Promise<{ slug: string }>;

/**
 * GET /api/qr/<slug>            → PNG (স্ক্রিনে দেখানোর জন্য)
 * GET /api/qr/<slug>?download=1 → PNG ডাউনলোড (প্রিন্টের জন্য)
 *
 * QR-এর ভেতরের লিংক: <site>/r/<slug>
 * Error correction "H" — প্রিন্ট করা কার্ড ময়লা/ছেঁড়া হলেও স্ক্যান হয়।
 */
export async function GET(req: Request, { params }: { params: Params }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
    return new Response("Invalid slug", { status: 400 });
  }

  const url = new URL(req.url);
  const base = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/+$/, "");
  const target = `${base}/r/${slug}`;

  const png = await QRCode.toBuffer(target, {
    type: "png",
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=3600",
  };
  if (url.searchParams.get("download") === "1") {
    headers["Content-Disposition"] = `attachment; filename="qr-${slug}.png"`;
  }

  return new Response(new Uint8Array(png), { headers });
}
