Module.register("MMM-IsraelNews", {
    defaults: {
        numLines: 10,
        scrollSpeed: 200,
        updateInterval: 600,
        newsHoursBack: 4, // Show news from the last 4 hours only
        urls: [
                "https://www.ynet.co.il/Integration/StoryRss1854.xml",
                // "https://www.srugim.co.il/feed",
                // "https://rss.walla.co.il/feed/22",
                // "https://www.maariv.co.il/Rss/RssFeedsMivzakiChadashot"
        ]
    },

    start: function() {
        Log.info("Starting module: " + this.name);
        this.newsItems = [];
        this.loaded = false;
        Log.info("MMM-IsraelNews: Sending GET_NEWS request with URLs: " + this.config.urls.join(", "));
        this.sendSocketNotification("GET_NEWS", {
            urls: this.config.urls,
            newsHoursBack: this.config.newsHoursBack
        });
        this.scheduleUpdate();
    },

    getStyles: function() {
        return ["MMM-IsraelNews.css"];
    },

    socketNotificationReceived: function(notification, payload) {
        Log.info("MMM-IsraelNews: Received notification: " + notification);
        if (notification === "NEWS_RESULT") {
            Log.info("MMM-IsraelNews: Received " + payload.length + " news items");
            this.newsItems = payload;
            this.loaded = true;
            this.updateDom();
        } else if (notification === "NEWS_ERROR") {
            Log.error("MMM-IsraelNews: Error fetching news", payload);
            this.loaded = true;
            this.updateDom();
        }
    },

    scheduleUpdate: function() {
        setInterval(() => {
            this.sendSocketNotification("GET_NEWS", {
                urls: this.config.urls,
                newsHoursBack: this.config.newsHoursBack
            });
        }, this.config.updateInterval);
    },

    getDom: function() {
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
                    faviconImg.onerror = function() { this.style.display = 'none'; };
                    iconTimeContainer.appendChild(faviconImg);
                }
                
                // Format the timestamp from pubDate
                if (item.pubDate) {
                    const date = new Date(item.pubDate);
                    if (!isNaN(date.getTime())) {
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