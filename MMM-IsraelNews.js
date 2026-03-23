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
            // Kan מבזקים (client-rendered): use the Umbraco-backed fetcher, not type "html":
            // { type: "kan-newsflash", url: "https://www.kan.org.il/newsflash" }
            // Optional: kanIgnoreNewsHoursBack: true — show all כאן rows, ignore newsHoursBack
            // i24NEWS עדכונים (JSON API):
            // { type: "i24-news", url: "https://www.i24news.tv/he/news" }
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

    /**
     * Stop JS smooth scroll (requestAnimationFrame). Call before DOM rebuild or suspend.
     */
    stopSmoothScroll: function () {
        if (this._scrollRafId != null) {
            cancelAnimationFrame(this._scrollRafId);
            this._scrollRafId = null;
        }
        if (this._scrollStartTimeout != null) {
            clearTimeout(this._scrollStartTimeout);
            this._scrollStartTimeout = null;
        }
        if (this._scrollResizeObserver) {
            this._scrollResizeObserver.disconnect();
            this._scrollResizeObserver = null;
        }
    },

    /**
     * Infinite vertical scroll using scrollTop only (no CSS transform animation).
     * Better on Raspberry Pi when GPU compositing is flaky.
     */
    _runSmoothScroll: function (viewport, container) {
        const self = this;
        let loopHeight = 0;
        const measureLoop = () => {
            const h = container.scrollHeight;
            if (h < 2) return 0;
            return h / 2;
        };

        const syncLoopHeight = () => {
            loopHeight = measureLoop();
        };
        syncLoopHeight();

        if (typeof ResizeObserver !== "undefined") {
            if (this._scrollResizeObserver) {
                this._scrollResizeObserver.disconnect();
            }
            this._scrollResizeObserver = new ResizeObserver(() => {
                syncLoopHeight();
            });
            this._scrollResizeObserver.observe(container);
        }

        const durationSec = (this.newsItems.length * this.config.scrollSpeed) / 100;
        if (durationSec <= 0) return;

        // Absolute timestamp position — frame-rate independent, no dt drift.
        let startTs = null;
        const durationMs = durationSec * 1000;
        const step = (ts) => {
            if (!viewport.isConnected) {
                self._scrollRafId = null;
                return;
            }

            if (typeof ResizeObserver === "undefined") {
                syncLoopHeight();
            }

            if (loopHeight <= 0) {
                self._scrollRafId = requestAnimationFrame(step);
                return;
            }

            if (viewport.clientHeight <= 0) {
                self._scrollRafId = requestAnimationFrame(step);
                return;
            }

            if (startTs == null) startTs = ts;
            viewport.scrollTop = ((ts - startTs) / durationMs * loopHeight) % loopHeight;

            self._scrollRafId = requestAnimationFrame(step);
        };

        this._scrollRafId = requestAnimationFrame(step);
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
            const data = Array.isArray(payload) ? { items: payload, stale: false } : payload || { items: [] };
            const items = data.items || [];

            Log.info(
                "MMM-IsraelNews: Received " +
                    items.length +
                    " news item(s)" +
                    (data.stale ? " — displaying cached headlines (network failed for all sources)" : "")
            );

            // Update state
            this.updateState.isRequestInProgress = false;
            this.updateState.lastUpdateTime = Date.now();
            this.updateState.retryCount = 0; // Reset retry count on success

            if (items.length > 0) {
                Log.info("MMM-IsraelNews: First item: " + items[0].title.substring(0, 50) + "...");
                Log.info("MMM-IsraelNews: Latest item date: " + items[0].pubDate);
            }

            this.newsItems = items;
            this.loaded = true;
            this.updateDom();
        } else if (notification === "NEWS_ERROR") {
            let msg;
            if (typeof payload === "string") {
                msg = payload;
            } else if (payload && typeof payload === "object") {
                msg = payload.detail || payload.message || JSON.stringify(payload);
            } else {
                msg = String(payload);
            }
            Log.error("MMM-IsraelNews: Fetch batch failed — " + msg);

            this.updateState.isRequestInProgress = false;
            this.loaded = true;
            // Keep previous headlines; do not clear newsItems or rebuild DOM
        }
    },

    // Manual update method for testing
    updateNews: function () {
        Log.info("MMM-IsraelNews: Manual news update triggered at " + new Date().toLocaleTimeString());
        this.requestNewsUpdate();
    },

    stop: function () {
        Log.info("MMM-IsraelNews: Stopping module and clearing all timers");
        this.stopSmoothScroll();
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
        this.stopSmoothScroll();
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
            // Restart JS scroll (suspend stops rAF; CSS animation did not need this)
            if (this._scrollViewport && this._scrollContainer &&
                this._scrollViewport.isConnected && this._scrollContainer.isConnected) {
                this.stopSmoothScroll();
                this._runSmoothScroll(this._scrollViewport, this._scrollContainer);
            }
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
        this.stopSmoothScroll();
        this._scrollViewport = null;
        this._scrollContainer = null;

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
            this.newsItems.forEach((item) => {
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
                    faviconImg.alt = item.source || "";
                    faviconImg.onerror = function () { this.style.visibility = "hidden"; this.style.width = "0"; this.style.margin = "0"; };
                    iconTimeContainer.appendChild(faviconImg);
                }

                // Format the timestamp from pubDate
                if (item.pubDate) {
                    const date = new Date(item.pubDate);
                    if (!isNaN(date.getTime())) {
                        // Check if this is a future date and log it
                        const now = new Date();
                        if (date > now) {
                            Log.warn("MMM-IsraelNews: Displaying future news item from " + item.source);
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

        wrapper.style.setProperty('--news-lines', this.config.numLines);

        if (this.newsItems.length > this.config.numLines) {
            const viewport = document.createElement("div");
            viewport.className = "news-scroll-viewport";
            viewport.appendChild(newsContainer);
            wrapper.appendChild(viewport);

            this._scrollViewport = viewport;
            this._scrollContainer = newsContainer;

            const self = this;
            this._scrollStartTimeout = setTimeout(() => {
                self._scrollStartTimeout = null;
                self._runSmoothScroll(viewport, newsContainer);
            }, 0);
        } else {
            this._scrollViewport = null;
            this._scrollContainer = null;
            wrapper.appendChild(newsContainer);
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