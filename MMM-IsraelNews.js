Module.register("MMM-IsraelNews", {
    defaults: {
        numLines: 4,
        scrollSpeed: 200,
        updateInterval: 300, // 5 minutes (300 seconds)
        newsHoursBack: 1, // Show news from the last 1 hour only
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
        
        // Initialize state management
        this.initializeState();

        // Create a safe string representation of URLs for logging
        const urlStrings = this.config.urls.map(url =>
            typeof url === 'string' ? url : url.url
        );
        Log.info("MMM-IsraelNews: Sending GET_NEWS request with URLs: " + urlStrings.join(", "));

        // Send initial request and start update cycle
        this.startUpdateCycle();
    },

    initializeState: function () {
        // State management for update intervals
        this.updateState = {
            healthCheckId: null,
            isRequestInProgress: false,
            lastUpdateTime: null,
            retryCount: 0,
            maxRetries: 3
        };
        
        Log.info("MMM-IsraelNews: State initialized");
    },

    startUpdateCycle: function () {
        Log.info("MMM-IsraelNews: Starting update cycle");
        
        // Clear any existing state
        this.clearAllTimers();
        
        // Send initial request - backend will handle scheduling
        this.requestNewsUpdate();
        
        // Set up health monitoring
        this.setupHealthMonitoring();
    },

    clearAllTimers: function () {
        if (this.updateState.healthCheckId) {
            clearInterval(this.updateState.healthCheckId);
            this.updateState.healthCheckId = null;
        }
        
        // Clear legacy timers if they exist
        if (this.updateIntervalId) {
            clearInterval(this.updateIntervalId);
            this.updateIntervalId = null;
        }
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        
        Log.info("MMM-IsraelNews: All timers cleared");
    },

    requestNewsUpdate: function () {
        if (this.updateState.isRequestInProgress) {
            Log.info("MMM-IsraelNews: Update request already in progress, skipping");
            return;
        }
        
        this.updateState.isRequestInProgress = true;
        
        Log.info("MMM-IsraelNews: Requesting news update at " + new Date().toLocaleTimeString());
        
        this.sendSocketNotification("GET_NEWS", {
            urls: this.config.urls,
            newsHoursBack: this.config.newsHoursBack
        });
    },

    // Removed scheduleUpdates method - backend now handles scheduling

    setupHealthMonitoring: function () {
        // Clear existing health check
        if (this.updateState.healthCheckId) {
            clearInterval(this.updateState.healthCheckId);
        }
        
        const self = this;
        
        // Health check every 5 minutes
        this.updateState.healthCheckId = setInterval(function() {
            const now = Date.now();
            const timeSinceLastUpdate = now - (self.updateState.lastUpdateTime || 0);
            const expectedInterval = (self.config.updateInterval || 300) * 1000;
            
            // If no update received for more than 2 intervals, something is wrong
            if (timeSinceLastUpdate > expectedInterval * 2.5) {
                Log.warn("MMM-IsraelNews: Health check failed - no updates received for " + 
                    Math.round(timeSinceLastUpdate / 1000) + " seconds");
                self.handleHealthCheckFailure();
            } else {
                Log.info("MMM-IsraelNews: Health check passed - last update " + 
                    Math.round(timeSinceLastUpdate / 1000) + " seconds ago");
            }
        }, 5 * 60 * 1000);
        
        Log.info("MMM-IsraelNews: Health monitoring enabled");
    },

    handleHealthCheckFailure: function () {
        this.updateState.retryCount++;
        
        if (this.updateState.retryCount > this.updateState.maxRetries) {
            Log.error("MMM-IsraelNews: Max retries reached, stopping health monitoring");
            return;
        }
        
        Log.warn("MMM-IsraelNews: Attempting to restart update cycle (attempt " + 
            this.updateState.retryCount + "/" + this.updateState.maxRetries + ")");
        
        // Reset request state and restart
        this.updateState.isRequestInProgress = false;
        this.requestNewsUpdate(); // Just request a new update, backend will handle scheduling
    },

    getStyles: function () {
        return ["MMM-IsraelNews.css"];
    },

    socketNotificationReceived: function (notification, payload) {
        Log.info("MMM-IsraelNews: Received notification: " + notification + " at " + new Date().toLocaleTimeString());
        
        if (notification === "NEWS_RESULT") {
            Log.info("MMM-IsraelNews: Received " + payload.length + " news items");
            
            // Update state
            this.updateState.isRequestInProgress = false;
            this.updateState.lastUpdateTime = Date.now();
            this.updateState.retryCount = 0; // Reset retry count on success
            
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
            
            // Update state
            this.updateState.isRequestInProgress = false;
            
            // Don't update lastUpdateTime on error to trigger health check if needed
            this.loaded = true;
            this.updateDom();
        }
    },

    // Manual update method for testing
    updateNews: function () {
        Log.info("MMM-IsraelNews: Manual news update triggered at " + new Date().toLocaleTimeString());
        this.requestNewsUpdate();
    },

    stop: function () {
        Log.info("MMM-IsraelNews: Stopping module and clearing all timers");
        this.clearAllTimers();
        
        // Tell backend to stop reloading
        this.sendSocketNotification("STOP_NEWS");
        
        // Reset state
        if (this.updateState) {
            this.updateState.isRequestInProgress = false;
            this.updateState.retryCount = 0;
        }
    },

    suspend: function () {
        Log.info("MMM-IsraelNews: Module suspended, clearing all timers");
        this.clearAllTimers();
        
        // Tell backend to stop reloading
        this.sendSocketNotification("STOP_NEWS");
        
        // Reset state
        if (this.updateState) {
            this.updateState.isRequestInProgress = false;
        }
    },

    resume: function () {
        Log.info("MMM-IsraelNews: Module resumed, restarting update cycle");
        
        // Wait a moment to ensure any concurrent operations complete
        setTimeout(() => {
            this.startUpdateCycle();
        }, 100);
    },

    notificationReceived: function (notification, payload, sender) {
        if (notification === "DOM_OBJECTS_CREATED") {
            // This is called when MagicMirror is fully loaded
            Log.info("MMM-IsraelNews: DOM objects created");
            
            // Only restart if we don't have an active update cycle
            if (!this.updateState || !this.updateState.intervalId) {
                Log.info("MMM-IsraelNews: No active update cycle, starting one");
                setTimeout(() => {
                    this.startUpdateCycle();
                }, 200);
            }
        } else if (notification === "MODULE_DOM_CREATED") {
            // This is called when the module's DOM is created
            Log.info("MMM-IsraelNews: Module DOM created");
        }
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
    },

    // Debug method to check update status
    getUpdateStatus: function () {
        if (!this.updateState) {
            return "Update state not initialized";
        }
        
        const now = Date.now();
        const status = {
            healthCheckActive: !!this.updateState.healthCheckId,
            isRequestInProgress: this.updateState.isRequestInProgress,
            lastUpdateTime: this.updateState.lastUpdateTime ? 
                new Date(this.updateState.lastUpdateTime).toLocaleTimeString() : 'Never',
            timeSinceLastUpdate: this.updateState.lastUpdateTime ? 
                Math.round((now - this.updateState.lastUpdateTime) / 1000) + 's' : 'N/A',
            retryCount: this.updateState.retryCount,
            configInterval: this.config.updateInterval + 's',
            note: "Backend handles scheduling"
        };
        
        Log.info("MMM-IsraelNews: Update Status", status);
        return status;
    }
});