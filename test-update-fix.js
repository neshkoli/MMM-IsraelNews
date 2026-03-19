// Test script to verify the update mechanism fix
// Run this in the browser console to test the module

console.log("Testing MMM-IsraelNews update mechanism...");

// Get the module instance
const module = MM.getModules().find(m => m.name === "MMM-IsraelNews");

if (!module) {
    console.error("MMM-IsraelNews module not found!");
} else {
    console.log("Found MMM-IsraelNews module");
    
    // Test the update status
    const status = module.getUpdateStatus();
    console.log("Update status:", status);
    
    // Test manual update
    console.log("Triggering manual update...");
    module.updateNews();
    
    // Check if the module has the correct default interval
    console.log("Default update interval:", module.config.updateInterval, "seconds");
    console.log("Expected: 300 seconds (5 minutes)");
    
    if (module.config.updateInterval === 300) {
        console.log("✅ Default interval is correct (5 minutes)");
    } else {
        console.log("❌ Default interval is wrong:", module.config.updateInterval);
    }
    
    // Test the news filtering
    console.log("News hours back setting:", module.config.newsHoursBack, "hours");
    
    // Check if the module has news items
    setTimeout(() => {
        console.log("Current news items:", module.newsItems.length);
        if (module.newsItems.length > 0) {
            console.log("✅ Module has news items");
            console.log("First item:", module.newsItems[0].title.substring(0, 50) + "...");
        } else {
            console.log("❌ No news items found");
        }
    }, 2000);
} 