export const sampleFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Sample Show</title>
  <link>https://example.com</link>
  <description>A show &amp; more</description>
  <itunes:author>Sample Author</itunes:author>
  <itunes:image href="https://example.com/art.jpg"/>
  <itunes:category text="News"/>
  <item>
    <title>Episode 3</title>
    <guid>ep-3</guid>
    <pubDate>Fri, 16 Oct 2026 07:00:00 GMT</pubDate>
    <enclosure url="https://example.com/3.mp3" type="audio/mpeg" length="1"/>
    <itunes:duration>1:02:03</itunes:duration>
    <description>Third</description>
  </item>
  <item>
    <title>Episode 2</title>
    <guid isPermaLink="false">ep-2</guid>
    <pubDate>Fri, 09 Oct 2026 07:00:00 GMT</pubDate>
    <enclosure url="https://example.com/2.mp3" type="audio/mpeg" length="1"/>
    <itunes:duration>1800</itunes:duration>
  </item>
  <item>
    <title>Episode 1</title>
    <pubDate>Fri, 02 Oct 2026 07:00:00 GMT</pubDate>
    <enclosure url="https://example.com/1.mp3" type="audio/mpeg" length="1"/>
    <itunes:duration>12:30</itunes:duration>
  </item>
  <item><title>No audio</title></item>
</channel>
</rss>`;
