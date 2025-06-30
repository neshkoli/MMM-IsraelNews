// Quick test to verify the node helper is working
const Parser = require("rss-parser");
const axios = require("axios");

async function quickTest() {
    console.log("Testing basic functionality...");
    
    // Test the mixed URL configuration that's in the module
    const testConfig = {
        urls: [
            "https://www.ynet.co.il/Integration/StoryRss1854.xml",
            {
                url: "https://www.israelhayom.co.il/israelnow",
                type: "html"
            }
        ],
        newsHoursBack: 24
    };
    
    console.log("Config:", JSON.stringify(testConfig, null, 2));
    
    // Test URL extraction
    const urlsForFavicon = testConfig.urls.map(source => 
        typeof source === 'string' ? source : source.url
    );
    console.log("Extracted URLs for favicon:", urlsForFavicon);
    
    // Test RSS parsing
    const parser = new Parser();
    try {
        console.log("\nTesting Ynet RSS...");
        const feed = await parser.parseURL("https://www.ynet.co.il/Integration/StoryRss1854.xml");
        console.log("✅ Ynet RSS works:", feed.items.length, "items");
    } catch (error) {
        console.log("❌ Ynet RSS error:", error.message);
    }
    
    try {
        console.log("\nTesting Israel Hayom RSS fallback...");
        const feed = await parser.parseURL("https://www.israelhayom.co.il/rss");
        console.log("✅ Israel Hayom RSS works:", feed.items.length, "items");
    } catch (error) {
        console.log("❌ Israel Hayom RSS error:", error.message);
        
        // Try with XML cleanup
        try {
            console.log("Trying with XML cleanup...");
            const response = await axios.get("https://www.israelhayom.co.il/rss");
            let xmlData = response.data;
            xmlData = xmlData.replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;');
            xmlData = xmlData.replace(/[\x00-\x1F\x7F]/g, '');
            const feed = await parser.parseString(xmlData);
            console.log("✅ Israel Hayom RSS with cleanup works:", feed.items.length, "items");
        } catch (cleanupError) {
            console.log("❌ Even with cleanup failed:", cleanupError.message);
        }
    }
}

quickTest().catch(console.error);
