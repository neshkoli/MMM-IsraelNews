# MMM-IsraelNews

A MagicMirror module for displaying news headlines from Israeli news sources in Hebrew, with support for both RSS feeds and HTML news flash pages.

## Features

- **Mixed sources**: RSS feeds, optional HTML scraping, כאן מבזקים (`kan-newsflash`), i24NEWS (`i24-news`)
- **Robust XML Parsing**: Handles malformed RSS feeds with automatic XML cleanup
- **Favicon Display**: Shows source favicons next to news items
- **Time Filtering**: Filter news by publication time (e.g., last 4 hours)
- **Scrolling Display**: Smooth vertical scroll via `requestAnimationFrame` + `scrollTop` (no CSS `transform` animation), which avoids extra compositor layers and is more stable on Raspberry Pi with GPU acceleration enabled
- **Hebrew Support**: Optimized for Hebrew text display

## Installation

1. Navigate to your MagicMirror modules directory:
```bash
cd ~/MagicMirror/modules
```

2. Clone this repository:
```bash
git clone https://github.com/neshkoli/MMM-IsraelNews.git
```

3. Install dependencies:
```bash
cd MMM-IsraelNews
npm install
```

(`package-lock.json` is not tracked in git; installs follow `package.json`.)

## Configuration

Add the module to your `config/config.js` file:

### Basic Configuration
```javascript
{
    module: "MMM-IsraelNews",
    position: "lower_third",
    config: {
        numLines: 10,
        scrollSpeed: 200,
        updateInterval: 300,
        newsHoursBack: 4,
        urls: [
            "https://www.ynet.co.il/Integration/StoryRss1854.xml",
            "https://www.israelhayom.co.il/israelnow"
        ]
    }
}
```

### Advanced Configuration with HTML Scraping

```javascript
{
    module: "MMM-IsraelNews",
    position: "lower_third",
    config: {
        numLines: 15,
        scrollSpeed: 150,
        updateInterval: 300,
        newsHoursBack: 6,
        urls: [
            // RSS feeds (recommended - reliable and fast)
            "https://www.ynet.co.il/Integration/StoryRss1854.xml",
            "https://www.srugim.co.il/feed",
            "https://rss.walla.co.il/feed/22",
            
            // HTML sources (for sites without RSS feeds)
            {
                url: "https://example-news-site.com/flash/",
                type: "html",
                selector: ".news-item",
                titleSelector: ".headline",
                linkSelector: "a"
            },
            
            // RSS with explicit type (optional)
            {
                url: "https://www.maariv.co.il/Rss/RssFeedsMivzakiChadashot",
                type: "rss"
            },

            // כאן 11 מבזקים — loaded in the browser via Umbraco; use this type (not HTML scrape)
            {
                type: "kan-newsflash",
                url: "https://www.kan.org.il/newsflash",
                timeZone: "Asia/Jerusalem"
            },

            {
                type: "i24-news",
                url: "https://www.i24news.tv/he/news"
            }
        ]
    }
}
```

## כאן (Kan) newsflash

The [מבזקים](https://www.kan.org.il/newsflash) page renders an empty shell in the initial HTML and fills the list with a request to `/umbraco/surface/NewsFlashSurface/GetNews`. The module reproduces that flow: it reads `data-page-id` from the page, calls the same endpoint with `timeZone` and `currentPageId`, then parses `.f-news__item` rows (time, headline, optional `a.card-link`).

Use browser-like HTTP headers for `kan.org.il`; very minimal `User-Agent` strings may receive HTTP 403.

**`newsHoursBack` and מבזקים:** כאן rows use the headline date and time on the page (parsed in `timeZone`, default `Asia/Jerusalem`), so they follow the same **`newsHoursBack`** window as RSS and i24. If you want to show all rows returned by the site (today / אתמול) regardless of `newsHoursBack`, set **`kanIgnoreNewsHoursBack: true`** on that source object.

## i24NEWS (עדכונים)

The Hebrew updates page ([i24news.tv/he/news](https://www.i24news.tv/he/news)) is backed by a public JSON list: `GET https://api.i24news.tv/v2/{locale}/news` (e.g. `he` for Hebrew). The module uses that API; `startedAt` becomes `pubDate`, and when an item has a full article, `content.frontendUrl` is used as the link.

Optional fields on the source object:

| Field | Description |
|--------|-------------|
| `locale` | `he`, `en`, `fr`, or `ar` — inferred from `url` if omitted |
| `apiBaseUrl` | Default `https://api.i24news.tv` |

## Logs and stale headlines

- **Per-source failures** are logged as: `MMM-IsraelNews: SOURCE_FAIL [<source>] <reason>` — the reason includes HTTP status (when applicable), Node error codes such as `ENOTFOUND`, `ETIMEDOUT`, `ECONNRESET`, or TLS messages.
- If **every** source fails in one refresh, the module **reuses the last successful headline list** (stale) until at least one source works again; look for `Showing … cached headline(s)` / `stale` in the logs.
- **Batch failures** before feeds are merged (e.g. favicon step) log `BATCH_FAIL` and the UI keeps the previous headlines.

Include `ERROR` in `config.logLevel` in MagicMirror’s main `config.js` so these lines appear in the console or log file.

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `numLines` | `10` | Number of news lines to display at once |
| `scrollSpeed` | `200` | Speed of scrolling animation (milliseconds per item) |
| `updateInterval` | `300` | Update interval in seconds (300 = 5 minutes) |
| `newsHoursBack` | `4` | Show news from the last X hours only |
| `urls` | `[]` | Array of news source URLs (supports mixed format) |

## URL Configuration Formats

### Simple Format (Backward Compatible)

For RSS feeds, you can use simple string URLs:

```javascript
urls: [
    "https://www.ynet.co.il/Integration/StoryRss1854.xml",
    "https://www.srugim.co.il/feed"
]
```

### Advanced Format (New)

For explicit control over source types:

```javascript
urls: [
    {
        url: "https://www.ynet.co.il/Integration/StoryRss1854.xml",
        type: "rss"
    },
    {
        url: "https://www.israelhayom.co.il/israelnow",
        type: "html"
    }
]
```

### Mixed Format

You can mix both formats in the same configuration:

```javascript
urls: [
    "https://www.ynet.co.il/Integration/StoryRss1854.xml",  // Auto-detected as RSS
    {
        url: "https://www.israelhayom.co.il/israelnow",
        type: "html"
    }
]
```

## Supported Sources

### RSS Feeds

- Ynet: `https://www.ynet.co.il/Integration/StoryRss1854.xml`
- Srugim: `https://www.srugim.co.il/feed`
- Walla: `https://rss.walla.co.il/feed/22`
- Maariv: `https://www.maariv.co.il/Rss/RssFeedsMivzakiChadashot`
- Israel Hayom RSS: `https://www.israelhayom.co.il/rss`

### HTML Sources with Custom Selectors

For HTML sources that don't provide RSS feeds, you can specify CSS selectors to scrape content:

```javascript
urls: [
    {
        url: "https://www.kan.org.il/newsflash/",
        type: "html",
        selector: ".flashes-item",           // Main container selector
        titleSelector: ".flashes-item",      // Title text selector (can be same as main)
        linkSelector: "a",                   // Link selector (optional)
        dateSelector: ".date-class"          // Date selector (optional)
    }
]
```

### HTML Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `type` | `"rss"` | Set to `"html"` for HTML scraping |
| `selector` | `".flashes-item"` | CSS selector for news item containers |
| `titleSelector` | Same as `selector` | CSS selector for title text within each item |
| `linkSelector` | `"a"` | CSS selector for links within each item (optional) |
| `dateSelector` | `null` | CSS selector for date within each item (optional, uses current time if not found) |

## How It Works

### RSS Sources

The module uses the `rss-parser` library to fetch and parse RSS feeds. It includes robust error handling for malformed XML:

1. **Direct Parsing**: Attempts to parse the RSS feed directly
2. **XML Cleanup**: If parsing fails, cleans common XML issues (unescaped ampersands, control characters)
3. **Retry Parsing**: Attempts to parse the cleaned XML

### HTML Sources

For HTML sources, the module uses Cheerio to parse the page and extract news items:

1. **HTTP Request**: Fetches the HTML page using axios
2. **DOM Parsing**: Parses the HTML using Cheerio (server-side jQuery)
3. **Content Extraction**: Uses CSS selectors to extract title, link, and date information
4. **Link Resolution**: Converts relative links to absolute URLs

### Supported HTML Sources

⚠️ **Note**: Many modern news sites load content dynamically via JavaScript, which means the news items may not be available in the initial HTML. For such sites, RSS feeds are recommended.

For sites with server-side rendered content, the module can scrape HTML:

Example configuration for a hypothetical static HTML news site:
```javascript
{
    url: "https://example-news-site.com/flash/",
    type: "html",
    selector: ".news-item",           // CSS selector for news containers
    titleSelector: ".headline",       // Selector for title within each item
    linkSelector: "a",                // Selector for links (optional)
    dateSelector: ".timestamp"        // Selector for dates (optional)
}
```

**Known Limitations**:
- Sites that load content via JavaScript (like Kan News Flash) will not work with HTML scraping
- Consider using RSS feeds when available for better reliability

### Auto-Detection

The module automatically detects URL types based on patterns:

- URLs containing `.xml`, `/rss`, or `/feed` are treated as RSS
- Other URLs are treated as HTML
- You can override detection by explicitly setting the `type` field

## Dependencies

- `rss-parser`: For parsing RSS feeds
- `cheerio`: For HTML parsing (future HTML scraping features)
- `axios`: For HTTP requests

## CSS Customization

The module uses the following CSS classes:

- `.MMM-IsraelNews`: Main container
- `.news-container`: Container for news items
- `.news-item`: Individual news item
- `.news-icon-time`: Container for favicon and timestamp
- `.news-favicon`: News source favicon
- `.news-time`: Publication timestamp
- `.news-headline`: News headline text

## Troubleshooting

### RSS Parsing Errors

If you see XML parsing errors, the module will automatically attempt to clean and re-parse the feed. Check the console logs for detailed error information.

### No News Items

1. Check that your URLs are accessible
2. Verify the `newsHoursBack` setting isn't too restrictive
3. Check console logs for error messages

### Slow Loading

1. Reduce the number of sources in `urls`
2. Increase `updateInterval` to reduce fetch frequency
3. Check network connectivity to news sources

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
