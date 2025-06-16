const NodeHelper = require("node_helper");
const Parser = require("rss-parser");
const Log = require("logger");
const https = require("https");
const IconUtils = require("./icon-utils");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: MMM-IsraelNews");
        Log.info("MMM-IsraelNews: Node helper starting...");
        
        // Initialize IconUtils
        this.iconUtils = new IconUtils();
        
        // Create a custom HTTPS agent that allows self-signed certificates
        // This is needed for Electron mode which has stricter SSL validation
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });
        
        this.parser = new Parser({
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MagicMirror)'
            },
            customFields: {
                item: ['description', 'content', 'link', 'pubDate']
            },
            // Add custom request options for HTTPS handling
            requestOptions: {
                agent: httpsAgent,
                timeout: 10000,
                rejectUnauthorized: false
            }
        });
        console.log("MMM-IsraelNews: Node helper started and RSS parser initialized with SSL workaround");
        Log.info("MMM-IsraelNews: Node helper started and RSS parser initialized with SSL workaround");
    },

    getNews: function(urls) {
        const self = this;
        
        // Handle both single URL (backward compatibility) and array of URLs
        const urlArray = Array.isArray(urls) ? urls : [urls];
        
        console.log("MMM-IsraelNews: Fetching news from " + urlArray.length + " sources: " + urlArray.join(", "));
        Log.info("MMM-IsraelNews: Fetching news from " + urlArray.length + " sources: " + urlArray.join(", "));
        
        // First, get favicon URLs for all sources
        this.iconUtils.getFaviconUrls(urlArray)
            .then(faviconMap => {
                console.log("MMM-IsraelNews: Favicon URLs retrieved");
                
                // Create promises for all RSS feeds
                const fetchPromises = urlArray.map(url => {
                    console.log("MMM-IsraelNews: Fetching from: " + url);
                    const faviconUrl = faviconMap.get(url);
                    
                    return this.parser.parseURL(url)
                        .then(feed => {
                            console.log("MMM-IsraelNews: Successfully fetched " + feed.items.length + " items from " + url);
                            return feed.items.map(item => ({
                                title: item.title || "No title",
                                link: item.link || "",
                                pubDate: item.pubDate || "",
                                description: item.description || "",
                                source: url,
                                favicon: faviconUrl // Add the properly detected favicon URL
                            }));
                        })
                        .catch(err => {
                            console.error("MMM-IsraelNews: Error fetching from " + url + ": ", err.message);
                            Log.error("MMM-IsraelNews: Error fetching from " + url + ": ", err.message);
                            return []; // Return empty array for failed sources
                        });
                });
                
                // Wait for all feeds to complete
                return Promise.all(fetchPromises);
            })
            .then(feedsResults => {
                // Flatten all results into a single array
                const allNewsItems = feedsResults.flat();
                
                console.log("MMM-IsraelNews: Total items collected: " + allNewsItems.length);
                Log.info("MMM-IsraelNews: Total items collected: " + allNewsItems.length);
                
                // Sort by publication date (newest first)
                allNewsItems.sort((a, b) => {
                    const dateA = new Date(a.pubDate);
                    const dateB = new Date(b.pubDate);
                    return dateB - dateA; // Descending order (newest first)
                });
                
                console.log("MMM-IsraelNews: Sending NEWS_RESULT with " + allNewsItems.length + " sorted items");
                Log.info("MMM-IsraelNews: Sending NEWS_RESULT with " + allNewsItems.length + " sorted items");
                self.sendSocketNotification("NEWS_RESULT", allNewsItems);
            })
            .catch(err => {
                console.error("MMM-IsraelNews: Error processing feeds: ", err.message);
                Log.error("MMM-IsraelNews: Error processing feeds: ", err.message);
                self.sendSocketNotification("NEWS_ERROR", err.message);
            });
    },

    socketNotificationReceived: function(notification, payload) {
        console.log("MMM-IsraelNews: Received notification: " + notification);
        Log.info("MMM-IsraelNews: Received notification: " + notification);
        if (notification === "GET_NEWS") {
            console.log("MMM-IsraelNews: Processing GET_NEWS request");
            Log.info("MMM-IsraelNews: Processing GET_NEWS request");
            this.getNews(payload);
        } else {
            console.log("MMM-IsraelNews: Unknown notification: " + notification);
            Log.warn("MMM-IsraelNews: Unknown notification: " + notification);
        }
    }
});