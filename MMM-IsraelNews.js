Module.register("MMM-IsraelNews", {
    defaults: {
        numLines: 10,
        scrollSpeed: 100,
        updateInterval: 600,
        urls: [
            "https://www.ynet.co.il/Integration/StoryRss1854.xml",
            "https://www.srugim.co.il/feed"
        ]
    },

    start: function() {
        Log.info("Starting module: " + this.name);
        this.newsItems = [];
        this.loaded = false;
        Log.info("MMM-IsraelNews: Sending GET_NEWS request with URLs: " + this.config.urls.join(", "));
        this.sendSocketNotification("GET_NEWS", this.config.urls);
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
            this.sendSocketNotification("GET_NEWS", this.config.urls);
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
                
                // Create favicon image element
                let faviconHTML = "";
                if (item.favicon) {
                    faviconHTML = `<img src="${item.favicon}" class="news-favicon" onerror="this.style.display='none'"> `;
                }
                
                // Format the timestamp from pubDate
                let timeStamp = "";
                if (item.pubDate) {
                    const date = new Date(item.pubDate);
                    if (!isNaN(date.getTime())) {
                        timeStamp = date.toLocaleTimeString('he-IL', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        }) + " - ";
                    }
                }
                
                newsItem.innerHTML = faviconHTML + timeStamp + item.title;
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