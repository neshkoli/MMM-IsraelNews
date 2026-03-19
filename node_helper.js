const NodeHelper = require("node_helper");
const Parser = require("rss-parser");
const Log = require("logger");
const https = require("https");
const IconUtils = require("./icon-utils");
const axios = require("axios");
const cheerio = require("cheerio");
const { DateTime } = require("luxon");

/** KAN and similar sites often 403 minimal bots; match a real browser. */
function browserLikeAxiosConfig() {
    return {
        timeout: 15000,
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7"
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: false
        })
    };
}

/**
 * ISO timestamp for a KAN row: wall clock in Israel (not the Node process timezone — Pis are often UTC).
 */
/** Locale segment for https://api.i24news.tv/v2/{locale}/news */
function inferI24Locale(pageUrl) {
    if (!pageUrl || typeof pageUrl !== "string") {
        return "he";
    }
    const m = pageUrl.match(/i24news\.tv\/(en|fr|ar|he)(?:\/|$)/i);
    return m ? m[1].toLowerCase() : "he";
}

/** URL string used for favicon lookup (must match urlsForFavicon entries). */
function sourceUrlForFavicon(sourceConfig) {
    if (typeof sourceConfig === "string") {
        return sourceConfig;
    }
    if (sourceConfig.type === "i24-news" && !sourceConfig.url) {
        const loc = (sourceConfig.locale && String(sourceConfig.locale).toLowerCase()) || "he";
        return `https://www.i24news.tv/${loc}/news`;
    }
    return sourceConfig.url;
}

function parseKanFlashPubDate(dateToken, timeText, zone) {
    const z = zone || "Asia/Jerusalem";
    if (!dateToken || !timeText) {
        return DateTime.now().setZone(z).toISO();
    }
    const dm = String(dateToken).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const tm = String(timeText).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!dm || !tm) {
        return DateTime.now().setZone(z).toISO();
    }
    const [, dd, mm, yyyy] = dm;
    const [, hh, mi] = tm;
    const dt = DateTime.fromObject(
        {
            year: parseInt(yyyy, 10),
            month: parseInt(mm, 10),
            day: parseInt(dd, 10),
            hour: parseInt(hh, 10),
            minute: parseInt(mi, 10)
        },
        { zone: z }
    );
    return dt.isValid ? dt.toISO() : DateTime.now().setZone(z).toISO();
}

module.exports = NodeHelper.create({
    start: function() {
        Log.info("MMM-IsraelNews: Node helper starting...");
        
        // Initialize IconUtils
        this.iconUtils = new IconUtils();
        
        // Initialize reload timer
        this.reloadTimer = null;
        this.currentConfig = null;
        
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
        
        Log.info("MMM-IsraelNews: Node helper started and RSS parser initialized with SSL workaround");
    },

    // Schedule the next reload
    scheduleReload: function() {
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
        }
        
        if (!this.currentConfig) {
            Log.warn("MMM-IsraelNews: No config available for scheduling reload");
            return;
        }
        
        const updateInterval = this.currentConfig.updateInterval || 300; // Default 5 minutes
        const intervalMs = updateInterval * 1000;
        
        Log.info("MMM-IsraelNews: Scheduling next reload in " + updateInterval + " seconds");
        
        this.reloadTimer = setTimeout(() => {
            Log.info("MMM-IsraelNews: Auto-reload triggered");
            this.getNews(this.currentConfig);
        }, intervalMs);
    },

    // Stop the reload timer
    stopReload: function() {
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
            this.reloadTimer = null;
            Log.info("MMM-IsraelNews: Reload timer stopped");
        }
    },

    scrapeHtmlNews: function(sourceConfig) {
        const self = this;
        const url = sourceConfig.url;
        const selector = sourceConfig.selector || '.flashes-item';
        const titleSelector = sourceConfig.titleSelector || selector;
        const linkSelector = sourceConfig.linkSelector;
        const dateSelector = sourceConfig.dateSelector;
        
        Log.info("MMM-IsraelNews: Scraping HTML from: " + url);
        
        return axios.get(url, browserLikeAxiosConfig())
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
                Log.warn("MMM-IsraelNews: No items found with selector '" + selector + "' from " + url + " (content may be loaded dynamically)");
            }
            
            return items;
        })
        .catch(err => {
            Log.error("MMM-IsraelNews: Error scraping HTML from " + url + ": ", err.message);
            return []; // Return empty array for failed sources
        });
    },

    /**
     * כאן מבזקים: the listing is injected via AJAX from Umbraco (see /sb/kan-newsflash-js.js).
     * Fetches the page once for data-page-id, then loads the same HTML fragment the browser gets.
     */
    fetchKanNewsflash: function(sourceConfig) {
        const pageUrl = sourceConfig.url || "https://www.kan.org.il/newsflash";
        const timeZone = sourceConfig.timeZone || "Asia/Jerusalem";
        const axiosOpts = browserLikeAxiosConfig();

        Log.info("MMM-IsraelNews: Fetching Kan newsflash from page: " + pageUrl);

        const skipHourFilter = !!sourceConfig.kanIgnoreNewsHoursBack;
        const apiHeaders = {
            ...axiosOpts.headers,
            Referer: pageUrl
        };

        return axios
            .get(pageUrl, axiosOpts)
            .then((pageRes) => {
                const $page = cheerio.load(pageRes.data);
                let pageId = $page(".flash-page").data("page-id");
                if (pageId == null || pageId === "") {
                    pageId = $page(".flash-page").attr("data-page-id");
                }
                if (pageId == null || pageId === "") {
                    Log.warn("MMM-IsraelNews: Kan page missing data-page-id; cannot load flashes");
                    return [];
                }
                const apiUrl = new URL("/umbraco/surface/NewsFlashSurface/GetNews", pageUrl).toString();
                return axios
                    .get(apiUrl, {
                        ...axiosOpts,
                        headers: apiHeaders,
                        params: {
                            timeZone,
                            currentPageId: pageId,
                            isMobileApp: false
                        },
                        responseType: "text"
                    })
                    .then((flashRes) => {
                        const $ = cheerio.load(flashRes.data);
                        const items = [];

                        $(".flashes-item").each((_, block) => {
                            const $block = $(block);
                            const dateLine = $block.find(".block-title span").last().text().trim();
                            const dateMatch = dateLine.match(/(\d{2}\.\d{2}\.\d{4})/);
                            const dateToken = dateMatch ? dateMatch[1] : null;

                            $block.find(".f-news__item").each((__, el) => {
                                const $el = $(el);
                                const timeText = $el.find(".time").first().text().trim();
                                const title = $el.find(".accordion-header .d-flex.flex-grow-1 > span").first().text().trim();
                                let link = $el.find("a.card-link").attr("href") || "";
                                if (link && !link.startsWith("http")) {
                                    link = new URL(link, pageUrl).toString();
                                }
                                if (!title || title.length < 3) {
                                    return;
                                }
                                const pubDate = parseKanFlashPubDate(dateToken, timeText, timeZone);
                                const row = {
                                    title,
                                    link: link || pageUrl,
                                    pubDate,
                                    description: title,
                                    source: pageUrl
                                };
                                if (skipHourFilter) {
                                    row.skipTimeFilter = true;
                                }
                                items.push(row);
                            });
                        });

                        if (items.length === 0) {
                            Log.warn("MMM-IsraelNews: Kan GetNews returned no .f-news__item rows");
                        } else {
                            Log.info(
                                "MMM-IsraelNews: Kan newsflash parsed " +
                                    items.length +
                                    " items (newsHoursBack filter: " +
                                    (skipHourFilter ? "off" : "on") +
                                    ")"
                            );
                        }
                        return items;
                    });
            })
            .catch((err) => {
                Log.error("MMM-IsraelNews: Error fetching Kan newsflash: ", err.message);
                return [];
            });
    },

    /**
     * i24NEWS עדכונים — public JSON at https://api.i24news.tv/v2/{locale}/news (same data as the site).
     * @see https://www.i24news.tv/he/news
     */
    fetchI24News: function(sourceConfig) {
        const locale = (sourceConfig.locale && String(sourceConfig.locale).toLowerCase()) || inferI24Locale(sourceConfig.url);
        const pageUrl = sourceConfig.url || `https://www.i24news.tv/${locale}/news`;
        const apiBase = String(sourceConfig.apiBaseUrl || "https://api.i24news.tv").replace(/\/$/, "");
        const apiUrl = `${apiBase}/v2/${locale}/news`;
        const axiosOpts = browserLikeAxiosConfig();

        Log.info("MMM-IsraelNews: Fetching i24NEWS: " + apiUrl);

        return axios
            .get(apiUrl, {
                ...axiosOpts,
                headers: {
                    ...axiosOpts.headers,
                    Accept: "application/json, text/plain, */*"
                }
            })
            .then((res) => {
                const rows = Array.isArray(res.data) ? res.data : [];
                const items = rows.map((entry) => {
                    const articleUrl =
                        entry.content && typeof entry.content.frontendUrl === "string"
                            ? entry.content.frontendUrl
                            : "";
                    return {
                        title: entry.title || "No title",
                        link: articleUrl || pageUrl,
                        pubDate: entry.startedAt || new Date().toISOString(),
                        description: entry.title || "",
                        source: pageUrl
                    };
                });
                Log.info("MMM-IsraelNews: i24NEWS parsed " + items.length + " items");
                return items;
            })
            .catch((err) => {
                Log.error("MMM-IsraelNews: Error fetching i24NEWS: ", err.message);
                return [];
            });
    },

    getNews: function(config) {
        const self = this;
        
        // Support both old format (just URLs) and new format (config object)
        const urls = Array.isArray(config) ? config : config.urls;
        const newsHoursBack = typeof config === 'object' && !Array.isArray(config) ? config.newsHoursBack : 24;
        
        // Handle both single URL (backward compatibility) and array of URLs
        const urlArray = Array.isArray(urls) ? urls : [urls];
        
        Log.info("MMM-IsraelNews: Fetching news from " + urlArray.length + " sources");
        Log.info("MMM-IsraelNews: Filtering news from last " + newsHoursBack + " hours");
        
        // Calculate the cutoff time
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - newsHoursBack);
        
        // Get favicon URLs for all sources (handle both string and object formats)
        const urlsForFavicon = urlArray.map((source) => sourceUrlForFavicon(source));
        
        // First, get favicon URLs for all sources
        this.iconUtils.getFaviconUrls(urlsForFavicon)
            .then(faviconMap => {
                // Create promises for all sources (RSS and HTML)
                const fetchPromises = urlArray.map(sourceConfig => {
                    const faviconKey = sourceUrlForFavicon(sourceConfig);
                    const feedUrl = typeof sourceConfig === "string" ? sourceConfig : sourceConfig.url;
                    const sourceType = typeof sourceConfig === 'object' ? sourceConfig.type : 'rss';
                    const faviconUrl = faviconMap.get(faviconKey);
                    
                    if (sourceType === 'html') {
                        // Handle HTML scraping
                        return this.scrapeHtmlNews(sourceConfig)
                            .then(items => items.map(item => ({
                                    ...item,
                                    favicon: faviconUrl
                                })));
                    } else if (sourceType === 'kan-newsflash') {
                        return this.fetchKanNewsflash(sourceConfig).then((items) =>
                            items.map((item) => ({
                                ...item,
                                favicon: faviconUrl
                            }))
                        );
                    } else if (sourceType === 'i24-news') {
                        return this.fetchI24News(sourceConfig).then((items) =>
                            items.map((item) => ({
                                ...item,
                                favicon: faviconUrl
                            }))
                        );
                    } else {
                        // Handle RSS feeds (default)
                        return this.parser.parseURL(feedUrl)
                            .then(feed => feed.items.map(item => ({
                                    title: item.title || "No title",
                                    link: item.link || "",
                                    pubDate: item.pubDate || "",
                                    description: item.description || "",
                                    source: feedUrl,
                                    favicon: faviconUrl
                                })))
                            .catch(err => {
                                Log.error("MMM-IsraelNews: Error fetching RSS from " + feedUrl + ": ", err.message);
                                return []; // Return empty array for failed sources
                            });
                    }
                });
                
                // Wait for all feeds to complete
                return Promise.all(fetchPromises);
            })
            .then(async feedsResults => {
                // Flatten all results into a single array
                const allNewsItems = feedsResults.flat();
                Log.info("MMM-IsraelNews: Total items collected: " + allNewsItems.length);
                
                // Filter items by publication date (only show items within the specified hours back)
                const now = new Date();
                const filteredNewsItems = allNewsItems.filter(item => {
                    if (item.skipTimeFilter) {
                        return true;
                    }
                    if (!item.pubDate) {
                        return true; // Keep items without publication date
                    }
                    const itemDate = new Date(item.pubDate);
                    if (isNaN(itemDate.getTime())) {
                        return true; // Keep items with invalid dates
                    }
                    
                    // Exclude future items (could be timezone issues)
                    if (itemDate > now) {
                        Log.info("MMM-IsraelNews: Excluding future-dated item from " + item.source);
                        return false;
                    }
                    
                    // Only include items within the time window
                    return itemDate >= cutoffTime;
                });
                
                Log.info("MMM-IsraelNews: Items after time filtering: " + filteredNewsItems.length + " (from last " + newsHoursBack + " hours)");
                
                // Sort by publication date (newest first)
                filteredNewsItems.sort((a, b) => {
                    const dateA = new Date(a.pubDate);
                    const dateB = new Date(b.pubDate);
                    if (isNaN(dateA.getTime())) return 1;
                    if (isNaN(dateB.getTime())) return -1;
                    return dateB - dateA; // Descending order (newest first)
                });
                
                Log.info("MMM-IsraelNews: Sending " + filteredNewsItems.length + " news items");
                self.sendSocketNotification("NEWS_RESULT", filteredNewsItems);

                // Re-fetch missing favicons for non-bundled sources (bundled icons are in icons/)
                const missingIcons = urlsForFavicon.filter(url => !self.iconUtils.getBuiltinIcon(url) && !self.iconUtils.getCachedIconPath(url));
                if (missingIcons.length > 0) {
                    Log.info(`MMM-IsraelNews: Re-fetching favicons for ${missingIcons.length} custom sources`);
                    await Promise.all(missingIcons.map(url => self.iconUtils.getFaviconUrl(url)));
                }

                // Schedule the next reload after successful fetch
                self.scheduleReload();
            })
            .catch(err => {
                Log.error("MMM-IsraelNews: Error processing sources: ", err.message);
                self.sendSocketNotification("NEWS_ERROR", err.message);
                
                // Schedule the next reload even on error to keep trying
                self.scheduleReload();
            });
    },

    socketNotificationReceived: function(notification, payload) {
        Log.info("MMM-IsraelNews: Received notification: " + notification);
        if (notification === "GET_NEWS") {
            Log.info("MMM-IsraelNews: Processing GET_NEWS request");
            this.currentConfig = payload; // Store the config for scheduling
            this.getNews(payload);
            // scheduleReload is called at end of getNews() - do NOT call here (would double-schedule)
        } else if (notification === "STOP_NEWS") {
            Log.info("MMM-IsraelNews: Received STOP_NEWS notification. Stopping reload timer.");
            this.stopReload();
        } else {
            Log.warn("MMM-IsraelNews: Unknown notification: " + notification);
        }
    }
});