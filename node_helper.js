const NodeHelper = require("node_helper");
const Parser = require("rss-parser");
const Log = require("logger");
const https = require("https");
const IconUtils = require("./icon-utils");
const axios = require("axios");
const cheerio = require("cheerio");

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

    scrapeHtmlNews: function(sourceConfig) {
        const self = this;
        const url = sourceConfig.url;
        const selector = sourceConfig.selector || '.flashes-item';
        const titleSelector = sourceConfig.titleSelector || selector;
        const linkSelector = sourceConfig.linkSelector;
        const dateSelector = sourceConfig.dateSelector;
        
        console.log("MMM-IsraelNews: Scraping HTML from: " + url + " with selector: " + selector);
        
        return axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MagicMirror)'
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        })
        .then(response => {
            const $ = cheerio.load(response.data);
            const items = [];
            
            $(selector).each((index, element) => {
                const $element = $(element);
                
                // Extract title
                let title = '';
                if (titleSelector === selector) {
                    title = $element.text().trim();
                } else {
                    title = $element.find(titleSelector).text().trim();
                }
                
                // Extract link
                let link = '';
                if (linkSelector) {
                    const linkElement = $element.find(linkSelector);
                    link = linkElement.attr('href') || '';
                    // Make relative links absolute
                    if (link && !link.startsWith('http')) {
                        const urlObj = new URL(url);
                        link = urlObj.origin + (link.startsWith('/') ? '' : '/') + link;
                    }
                } else {
                    // Default: try to find a link in the element
                    const linkElement = $element.find('a').first();
                    link = linkElement.attr('href') || '';
                    if (link && !link.startsWith('http')) {
                        const urlObj = new URL(url);
                        link = urlObj.origin + (link.startsWith('/') ? '' : '/') + link;
                    }
                }
                
                // Extract date
                let pubDate = '';
                if (dateSelector) {
                    pubDate = $element.find(dateSelector).text().trim();
                } else {
                    // Default: use current time for HTML scraped content
                    pubDate = new Date().toISOString();
                }
                
                if (title && title.length > 5) { // Only include items with meaningful titles
                    items.push({
                        title: title,
                        link: link || url,
                        pubDate: pubDate,
                        description: title, // Use title as description for HTML content
                        source: url
                    });
                }
            });
            
            if (items.length === 0) {
                console.warn("MMM-IsraelNews: No items found with selector '" + selector + "' from " + url);
                console.warn("MMM-IsraelNews: This may indicate that the content is loaded dynamically via JavaScript.");
                console.warn("MMM-IsraelNews: Consider using an RSS feed instead, or checking if the site provides an API.");
            } else {
                console.log("MMM-IsraelNews: Successfully scraped " + items.length + " items from " + url);
            }
            
            return items;
        })
        .catch(err => {
            console.error("MMM-IsraelNews: Error scraping HTML from " + url + ": ", err.message);
            Log.error("MMM-IsraelNews: Error scraping HTML from " + url + ": ", err.message);
            return []; // Return empty array for failed sources
        });
    },

    getNews: function(config) {
        const self = this;
        
        // Support both old format (just URLs) and new format (config object)
        const urls = Array.isArray(config) ? config : config.urls;
        const newsHoursBack = typeof config === 'object' && !Array.isArray(config) ? config.newsHoursBack : 24;
        
        // Handle both single URL (backward compatibility) and array of URLs
        const urlArray = Array.isArray(urls) ? urls : [urls];
        
        console.log("MMM-IsraelNews: Fetching news from " + urlArray.length + " sources");
        console.log("MMM-IsraelNews: Filtering news from last " + newsHoursBack + " hours");
        Log.info("MMM-IsraelNews: Fetching news from " + urlArray.length + " sources");
        Log.info("MMM-IsraelNews: Filtering news from last " + newsHoursBack + " hours");
        
        // Calculate the cutoff time
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - newsHoursBack);
        
        // Get favicon URLs for all sources (handle both string and object formats)
        const urlsForFavicon = urlArray.map(source => 
            typeof source === 'string' ? source : source.url
        );
        
        // First, get favicon URLs for all sources
        this.iconUtils.getFaviconUrls(urlsForFavicon)
            .then(faviconMap => {
                console.log("MMM-IsraelNews: Favicon URLs retrieved");
                
                // Create promises for all sources (RSS and HTML)
                const fetchPromises = urlArray.map(sourceConfig => {
                    const url = typeof sourceConfig === 'string' ? sourceConfig : sourceConfig.url;
                    const sourceType = typeof sourceConfig === 'object' ? sourceConfig.type : 'rss';
                    const faviconUrl = faviconMap.get(url);
                    
                    console.log("MMM-IsraelNews: Fetching from: " + url + " (type: " + sourceType + ")");
                    
                    if (sourceType === 'html') {
                        // Handle HTML scraping
                        return this.scrapeHtmlNews(sourceConfig)
                            .then(items => {
                                console.log("MMM-IsraelNews: Successfully scraped " + items.length + " items from " + url);
                                return items.map(item => ({
                                    ...item,
                                    favicon: faviconUrl
                                }));
                            });
                    } else {
                        // Handle RSS feeds (default)
                        return this.parser.parseURL(url)
                            .then(feed => {
                                console.log("MMM-IsraelNews: Successfully fetched " + feed.items.length + " items from " + url);
                                return feed.items.map(item => ({
                                    title: item.title || "No title",
                                    link: item.link || "",
                                    pubDate: item.pubDate || "",
                                    description: item.description || "",
                                    source: url,
                                    favicon: faviconUrl
                                }));
                            })
                            .catch(err => {
                                console.error("MMM-IsraelNews: Error fetching RSS from " + url + ": ", err.message);
                                Log.error("MMM-IsraelNews: Error fetching RSS from " + url + ": ", err.message);
                                return []; // Return empty array for failed sources
                            });
                    }
                });
                
                // Wait for all feeds to complete
                return Promise.all(fetchPromises);
            })
            .then(feedsResults => {
                // Flatten all results into a single array
                const allNewsItems = feedsResults.flat();
                
                console.log("MMM-IsraelNews: Total items collected: " + allNewsItems.length);
                Log.info("MMM-IsraelNews: Total items collected: " + allNewsItems.length);
                
                // Filter items by publication date (only show items within the specified hours back)
                const now = new Date();
                const filteredNewsItems = allNewsItems.filter(item => {
                    if (!item.pubDate) {
                        return true; // Keep items without publication date
                    }
                    const itemDate = new Date(item.pubDate);
                    if (isNaN(itemDate.getTime())) {
                        return true; // Keep items with invalid dates
                    }
                    
                    // Exclude future items (could be timezone issues)
                    if (itemDate > now) {
                        console.log("MMM-IsraelNews: Excluding future item: " + item.title.substring(0, 50) + " (date: " + item.pubDate + ")");
                        return false;
                    }
                    
                    // Only include items within the time window
                    return itemDate >= cutoffTime;
                });
                
                console.log("MMM-IsraelNews: Items after time filtering: " + filteredNewsItems.length + " (from last " + newsHoursBack + " hours)");
                console.log("MMM-IsraelNews: Time window: " + cutoffTime.toLocaleString() + " to " + now.toLocaleString());
                Log.info("MMM-IsraelNews: Items after time filtering: " + filteredNewsItems.length + " (from last " + newsHoursBack + " hours)");
                
                // Sort by publication date (newest first)
                filteredNewsItems.sort((a, b) => {
                    const dateA = new Date(a.pubDate);
                    const dateB = new Date(b.pubDate);
                    if (isNaN(dateA.getTime())) return 1;
                    if (isNaN(dateB.getTime())) return -1;
                    return dateB - dateA; // Descending order (newest first)
                });
                
                console.log("MMM-IsraelNews: Sending NEWS_RESULT with " + filteredNewsItems.length + " sorted items (newest first)");
                Log.info("MMM-IsraelNews: Sending NEWS_RESULT with " + filteredNewsItems.length + " sorted items (newest first)");
                self.sendSocketNotification("NEWS_RESULT", filteredNewsItems);
            })
            .catch(err => {
                console.error("MMM-IsraelNews: Error processing sources: ", err.message);
                Log.error("MMM-IsraelNews: Error processing sources: ", err.message);
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