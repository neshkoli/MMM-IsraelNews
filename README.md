# MMM-IsraelNews

A MagicMirror module for displaying news headlines from Israeli news sources in Hebrew, with support for both RSS feeds and HTML news flash pages.

## Features

- **Mixed Source Support**: Supports both RSS feeds and HTML news flash pages
- **Automatic URL Type Detection**: Automatically detects whether a URL is RSS or HTML
- **Robust XML Parsing**: Handles malformed RSS feeds with automatic XML cleanup
- **Favicon Display**: Shows source favicons next to news items
- **Time Filtering**: Filter news by publication time (e.g., last 4 hours)
- **Scrolling Display**: Smooth scrolling animation for multiple news items
- **Hebrew Support**: Optimized for Hebrew text display

## Installation

1. Navigate to your MagicMirror modules directory:
```bash
cd ~/MagicMirror/modules
```

2. Clone this repository:
```bash
git clone https://github.com/yourusername/MMM-IsraelNews.git
```

3. Install dependencies:
```bash
cd MMM-IsraelNews
npm install
```

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
        updateInterval: 600,
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
            }
        ]
    }
}
```
```
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `numLines` | `10` | Number of news lines to display at once |
| `scrollSpeed` | `200` | Speed of scrolling animation (milliseconds per item) |
| `updateInterval` | `600` | Update interval in seconds (600 = 10 minutes) |
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
