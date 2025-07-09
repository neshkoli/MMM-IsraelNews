// Example configuration for MMM-IsraelNews with mixed RSS and HTML sources
// Copy this into your config/config.js file

{
    module: "MMM-IsraelNews",
    position: "lower_third", // or "top_bar", "bottom_bar", etc.
    config: {
        // Display settings
        numLines: 12,           // Number of news lines to show at once
        scrollSpeed: 180,       // Animation speed (milliseconds per item)
        updateInterval: 300,    // Update every 5 minutes (300 seconds)
        newsHoursBack: 4,       // Show news from the last 4 hours only
        
        // News sources (mixed RSS and HTML)
        urls: [
            // RSS feeds (recommended - fast and reliable)
            "https://www.ynet.co.il/Integration/StoryRss1854.xml",   // Ynet main news
            "https://www.srugim.co.il/feed",                         // Srugim
            "https://rss.walla.co.il/feed/22",                      // Walla news
            
            // Explicit RSS configuration (optional)
            {
                url: "https://www.maariv.co.il/Rss/RssFeedsMivzakiChadashot",
                type: "rss"
            },
            
            // HTML scraping example (for sites without RSS)
            // Note: Only works for sites with server-side rendered content
            {
                url: "https://example-news-site.com/flash/",
                type: "html",
                selector: ".news-item",        // CSS selector for news items
                titleSelector: ".headline",    // Selector for title text
                linkSelector: "a",             // Selector for links (optional)
                dateSelector: ".date"          // Selector for dates (optional)
            }
            
            // Additional RSS sources you can try:
            // "https://www.inn.co.il/Rss.aspx",              // INN
            // "https://www.kikar.co.il/rss",                 // Kikar Hashabat
            // "https://www.news1.co.il/rss",                 // News1
        ]
    }
}

/* 
USAGE NOTES:

1. RSS vs HTML:
   - RSS feeds are faster, more reliable, and recommended
   - HTML scraping is for sites that don't provide RSS feeds
   - Many modern sites load content via JavaScript, which won't work with HTML scraping

2. Testing sources:
   - Check the MagicMirror logs for error messages
   - If an RSS feed doesn't work, try accessing it directly in a browser
   - For HTML sources, verify that the content is in the initial HTML (not loaded by JS)

3. Performance:
   - Too many sources can slow down updates
   - Increase updateInterval if you have many sources
   - Use newsHoursBack to filter old news and improve performance

4. Troubleshooting:
   - Check browser console for errors
   - Look at MagicMirror logs: `pm2 logs mm`
   - Test individual RSS feeds in a browser first
*/
