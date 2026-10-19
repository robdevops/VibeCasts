/** Same-origin proxy so the web build can read RSS feeds that lack CORS headers. */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url || !/^https?:\/\//i.test(url)) return new Response('Bad url', { status: 400 });
  try {
    const upstream = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  } catch {
    return new Response('Could not reach the feed', { status: 502 });
  }
}
