// Test script to validate the fixed updateInterval mechanism
// This simulates the MagicMirror environment and tests the update cycle

// Mock MagicMirror dependencies
const Log = {
    info: function(msg) { console.log('[INFO]', msg); },
    warn: function(msg) { console.log('[WARN]', msg); },
    error: function(msg) { console.log('[ERROR]', msg); }
};

// Mock Module.register
const Module = {
    register: function(name, moduleDefinition) {
        console.log('Testing module:', name);
        
        // Create a test instance
        const testInstance = Object.create(moduleDefinition);
        
        // Set up test configuration
        testInstance.config = {
            updateInterval: 10, // 10 seconds for testing
            newsHoursBack: 1,
            urls: [
                "https://www.ynet.co.il/Integration/StoryRss1854.xml",
                "https://www.inn.co.il/Rss.aspx"
            ]
        };
        
        // Mock socket notification
        testInstance.sendSocketNotification = function(notification, payload) {
            console.log('Sending notification:', notification, payload);
            
            // Simulate response after a delay
            setTimeout(() => {
                if (notification === "GET_NEWS") {
                    testInstance.socketNotificationReceived("NEWS_RESULT", [
                        { title: "Test News Item 1", pubDate: new Date().toISOString() },
                        { title: "Test News Item 2", pubDate: new Date().toISOString() }
                    ]);
                }
            }, 1000);
        };
        
        // Mock DOM update
        testInstance.updateDom = function() {
            console.log('DOM updated with', this.newsItems.length, 'items');
        };
        
        // Start the module
        console.log('\n=== Starting Module ===');
        testInstance.start();
        
        // Test status after 2 seconds
        setTimeout(() => {
            console.log('\n=== Status Check (2s) ===');
            testInstance.getUpdateStatus();
        }, 2000);
        
        // Test manual update
        setTimeout(() => {
            console.log('\n=== Manual Update Test (5s) ===');
            testInstance.updateNews();
        }, 5000);
        
        // Test suspend/resume
        setTimeout(() => {
            console.log('\n=== Suspend Test (8s) ===');
            testInstance.suspend();
        }, 8000);
        
        setTimeout(() => {
            console.log('\n=== Resume Test (10s) ===');
            testInstance.resume();
        }, 10000);
        
        // Test status after resume
        setTimeout(() => {
            console.log('\n=== Status Check After Resume (12s) ===');
            testInstance.getUpdateStatus();
        }, 12000);
        
        // Test race condition prevention
        setTimeout(() => {
            console.log('\n=== Race Condition Test (15s) ===');
            console.log('Calling startUpdateCycle multiple times simultaneously...');
            testInstance.startUpdateCycle();
            testInstance.startUpdateCycle();
            testInstance.startUpdateCycle();
        }, 15000);
        
        // Final status check
        setTimeout(() => {
            console.log('\n=== Final Status Check (18s) ===');
            testInstance.getUpdateStatus();
        }, 18000);
        
        // Clean up
        setTimeout(() => {
            console.log('\n=== Cleanup (20s) ===');
            testInstance.stop();
            console.log('Test completed');
        }, 20000);
        
        return testInstance;
    }
};

// Load and test the module
const fs = require('fs');
const path = require('path');

// Read the module file
const moduleCode = fs.readFileSync(path.join(__dirname, 'MMM-IsraelNews.js'), 'utf8');

// Execute the module code in our test environment
eval(moduleCode);
