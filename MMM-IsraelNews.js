Module.register("MMM-IsraelNews", {
    defaults: {
        numLines: 4,
        scrollSpeed: 200,
        updateInterval: 600,
        newsHoursBack: 4, // Show news from the last 4 hours only
        urls: [
            "https://www.ynet.co.il/Integration/StoryRss1854.xml",
            "https://www.inn.co.il/Rss.aspx",
            "https://www.srugim.co.il/feed"
            // You can add more URLs like this:
            // "https://rss.walla.co.il/feed/22",
            // Or use the new HTML scraping format for sites with static content:
            // {
            //     url: "https://example-news-site.com/flash/",
            //     type: "html",
            //     selector: ".news-item",
            //     titleSelector: ".headline",
            //     linkSelector: "a"
            // }
            // Note: Kan News Flash loads content dynamically and won't work with HTML scraping
        ]
    },

    start: function () {
        Log.info("Starting module: " + this.name);
        this.newsItems = [];
        this.loaded = false;

        // Create a safe string representation of URLs for logging
        const urlStrings = this.config.urls.map(url =>
            typeof url === 'string' ? url : url.url
        );
        Log.info("MMM-IsraelNews: Sending GET_NEWS request with URLs: " + urlStrings.join(", "));

        // Send initial request
        this.sendSocketNotification("GET_NEWS", {
            urls: this.config.urls,
            newsHoursBack: this.config.newsHoursBack
        });

        // Schedule recurring updates
        this.scheduleUpdate();
    },

    getStyles: function () {
        return ["MMM-IsraelNews.css"];
    },

    socketNotificationReceived: function (notification, payload) {
        Log.info("MMM-IsraelNews: Received notification: " + notification + " at " + new Date().toLocaleTimeString());
        if (notification === "NEWS_RESULT") {
            Log.info("MMM-IsraelNews: Received " + payload.length + " news items");
            
            // Log some details about the received items for debugging
            if (payload.length > 0) {
                Log.info("MMM-IsraelNews: First item: " + payload[0].title.substring(0, 50) + "...");
                Log.info("MMM-IsraelNews: Latest item date: " + payload[0].pubDate);
            }
            
            this.newsItems = payload;
            this.loaded = true;
            this.updateDom();
        } else if (notification === "NEWS_ERROR") {
            Log.error("MMM-IsraelNews: Error fetching news", payload);
            this.loaded = true;
            this.updateDom();
        }
    },

    // Manual update method for testing
    updateNews: function () {
        Log.info("MMM-IsraelNews: Manual news update triggered at " + new Date().toLocaleTimeString());
        this.sendSocketNotification("GET_NEWS", {
            urls: this.config.urls,
            newsHoursBack: this.config.newsHoursBack
        });
    },

    stop: function () {
        Log.info("MMM-IsraelNews: Stopping module and clearing update interval");
        if (this.updateIntervalId) {
            clearInterval(this.updateIntervalId);
            this.updateIntervalId = null;
        }
    },

    scheduleUpdate: function () {
        const self = this;
        
        // Clear any existing interval first
        if (this.updateIntervalId) {
            clearInterval(this.updateIntervalId);
        }
        
        const updateNews = function() {
            Log.info("MMM-IsraelNews: Scheduled update triggered at " + new Date().toLocaleTimeString());
            Log.info("MMM-IsraelNews: Update interval is " + self.config.updateInterval + " seconds");
            self.sendSocketNotification("GET_NEWS", {
                urls: self.config.urls,
                newsHoursBack: self.config.newsHoursBack
            });
        };
        
        // Set up recurring updates
        const intervalMs = this.config.updateInterval * 1000; // Convert seconds to milliseconds
        this.updateIntervalId = setInterval(updateNews, intervalMs);
        
        Log.info("MMM-IsraelNews: Scheduled updates every " + this.config.updateInterval + " seconds (" + intervalMs + "ms)");
        Log.info("MMM-IsraelNews: Next update at " + new Date(Date.now() + intervalMs).toLocaleTimeString());
    },

    getDom: function () {
        console.log("MMM-IsraelNews getDom called, loaded:", this.loaded, "newsItems:", this.newsItems.length);
        const wrapper = document.createElement("div");
        wrapper.className = "MMM-IsraelNews";

        if (!this.loaded) {
            wrapper.innerHTML = "Loading news...";
            return wrapper;
        }

        if (this.newsItems.length === 0) {
            wrapper.innerHTML = "No news available";
            return wrapper;
        }

        const newsContainer = document.createElement("div");
        newsContainer.className = "news-container";

        // Create news items and duplicate them for seamless loop
        const createNewsItems = () => {
            this.newsItems.forEach((item, index) => {
                console.log("Adding news item", index, item.title);
                const newsItem = document.createElement("div");
                newsItem.className = "news-item";

                // Create favicon and timestamp container
                const iconTimeContainer = document.createElement("div");
                iconTimeContainer.className = "news-icon-time";

                // Create favicon image element
                if (item.favicon) {
                    const faviconImg = document.createElement("img");
                    faviconImg.src = item.favicon;
                    faviconImg.className = "news-favicon";
                    faviconImg.onerror = function () { this.style.display = 'none'; };
                    iconTimeContainer.appendChild(faviconImg);
                }

                // Format the timestamp from pubDate
                if (item.pubDate) {
                    const date = new Date(item.pubDate);
                    if (!isNaN(date.getTime())) {
                        // Check if this is a future date and log it
                        const now = new Date();
                        if (date > now) {
                            console.warn("MMM-IsraelNews: Displaying future news item:", {
                                title: item.title.substring(0, 50),
                                pubDate: item.pubDate,
                                parsedDate: date.toString(),
                                source: item.source
                            });
                        }
                        
                        const timeStamp = date.toLocaleTimeString('he-IL', {
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        const timeElement = document.createElement("span");
                        timeElement.className = "news-time";
                        timeElement.textContent = timeStamp;
                        iconTimeContainer.appendChild(timeElement);
                    }
                }

                // Create headline container
                const headlineContainer = document.createElement("div");
                headlineContainer.className = "news-headline";
                headlineContainer.textContent = item.title;

                // Add both containers to the news item
                newsItem.appendChild(iconTimeContainer);
                newsItem.appendChild(headlineContainer);
                newsContainer.appendChild(newsItem);
            });
        };

        // Add items twice for seamless infinite scroll
        createNewsItems();
        createNewsItems();

        wrapper.appendChild(newsContainer);

        // Set the CSS variable for max height based on numLines
        wrapper.style.setProperty('--news-lines', this.config.numLines);
        console.log("Set CSS variable --news-lines to:", this.config.numLines);

        // Add scrolling if there are more items than visible lines
        if (this.newsItems.length > this.config.numLines) {
            newsContainer.classList.add('scrolling');
            // Calculate animation duration based on number of items and scroll speed
            const animationDuration = (this.newsItems.length * this.config.scrollSpeed) / 100;
            newsContainer.style.animationDuration = animationDuration + 's';
            console.log("Added scrolling animation with duration:", animationDuration + 's');
        }

        return wrapper;
    }
});