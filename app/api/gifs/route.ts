import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GIF search via GIPHY (optional: set GIPHY_API_KEY). Free key: developers.giphy.com
export async function GET(req: NextRequest) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return NextResponse.json({ error: 'no_key', gifs: [] }, { status: 503 });
  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 60);
  const url = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=pg-13`;
  try {
    const j = await (await fetch(url, { cache: 'no-store' })).json();
    const gifs = ((j.data || []) as { id: string; images: { fixed_height_small?: { url: string }; fixed_height?: { url: string } } }[])
      .map((g) => ({ id: g.id, url: g.images.fixed_height?.url || '', preview: g.images.fixed_height_small?.url || g.images.fixed_height?.url || '' })).filter((g) => g.url);
    return NextResponse.json({ gifs });
  } catch { return NextResponse.json({ gifs: [] }, { status: 502 }); }
}
