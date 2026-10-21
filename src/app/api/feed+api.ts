import { splitCredentials } from '@/lib/podcast-id';

/** Same-origin proxy so the web build can read RSS feeds that lack CORS headers. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('url');
  if (!raw || !/^https?:\/\//i.test(raw)) return new Response('Bad url', { status: 400 });
  // fetch() rejects URLs with embedded credentials, so they become a Basic header.
  const { url, authorization } = splitCredentials(raw);
  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5',
        ...(authorization ? { Authorization: authorization } : null),
      },
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  } catch {
    return new Response('Could not reach the feed', { status: 502 });
  }
}
