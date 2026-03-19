# MMM-IsraelNews Update Interval Fix

## Problem Description

The MMM-IsraelNews module had a bug where news items were not being updated after the `updateInterval` time period. The module was only fetching news when explicitly requested, not automatically on a schedule.

## Root Cause Analysis

After comparing with the reference `newsfeed` module, the following issues were identified:

1. **Missing Backend Reload Mechanism**: The reference module uses a `NewsfeedFetcher` class that automatically schedules reloads based on `reloadInterval`. Our module only fetched when explicitly requested.

2. **Frontend vs Backend Timing**: The reference module handles the reload interval in the backend (node_helper), while our module tried to manage it in the frontend.

3. **No Persistent Timer**: Our module's `scheduleUpdates()` method set up an interval, but there was no mechanism to automatically trigger new fetches from the node_helper.

4. **Incorrect Default Interval**: The default was 600 seconds (10 minutes) instead of the requested 300 seconds (5 minutes).

## Solution Implemented

### 1. Backend Reload Mechanism (node_helper.js)

Added proper reload scheduling in the node_helper:

```javascript
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
}
```

### 2. Frontend Timer Management Removal (MMM-IsraelNews.js)

Removed frontend scheduling since the backend now handles it:

- Removed `scheduleUpdates()` method
- Removed `intervalId` from state management
- Updated `clearAllTimers()` to only handle health monitoring
- Added `STOP_NEWS` notification to stop backend reloading

### 3. Default Interval Correction

Changed the default `updateInterval` from 600 seconds to 300 seconds (5 minutes):

```javascript
defaults: {
    updateInterval: 300, // 5 minutes (300 seconds)
    // ... other defaults
}
```

### 4. Proper Cleanup

Added proper cleanup when the module stops or suspends:

```javascript
stop: function () {
    // ... existing code ...
    this.sendSocketNotification("STOP_NEWS");
    // ... rest of cleanup
}
```

## Key Changes Made

### Frontend (MMM-IsraelNews.js)
- ✅ Changed default `updateInterval` from 600 to 300 seconds
- ✅ Removed frontend scheduling mechanism
- ✅ Added backend communication for stopping reloads
- ✅ Updated state management to remove unused properties
- ✅ Updated health monitoring to work with backend-driven updates

### Backend (node_helper.js)
- ✅ Added `scheduleReload()` method for automatic refetching
- ✅ Added `stopReload()` method for cleanup
- ✅ Added `reloadTimer` and `currentConfig` properties
- ✅ Modified `getNews()` to schedule next reload after successful fetch
- ✅ Added `STOP_NEWS` notification handling

### Documentation
- ✅ Updated `example-config.js` to show 300 seconds default
- ✅ Updated `README.md` to reflect new default interval
- ✅ Created test script for verification

## Testing

The fix can be tested using the provided test script:

```javascript
// Run in browser console
const module = MM.getModules().find(m => m.name === "MMM-IsraelNews");
console.log("Update status:", module.getUpdateStatus());
module.updateNews(); // Test manual update
```

## Expected Behavior

1. **Initial Load**: Module fetches news immediately when started
2. **Automatic Updates**: Backend automatically refetches news every 5 minutes (or configured interval)
3. **Time Filtering**: Only shows news from the last `newsHoursBack` period
4. **Health Monitoring**: Frontend monitors for failed updates and can trigger manual refresh
5. **Clean Shutdown**: Properly stops backend reloading when module is stopped/suspended

## Verification

To verify the fix is working:

1. Check the MagicMirror logs for reload messages:
   ```
   MMM-IsraelNews: Scheduling next reload in 300 seconds
   MMM-IsraelNews: Auto-reload triggered
   ```

2. Monitor the news items to see they update every 5 minutes

3. Check that only recent news (within `newsHoursBack` hours) is displayed

4. Verify the module properly stops reloading when suspended/stopped

## Files Modified

- `modules/MMM-IsraelNews/MMM-IsraelNews.js` - Frontend module
- `modules/MMM-IsraelNews/node_helper.js` - Backend helper
- `modules/MMM-IsraelNews/example-config.js` - Example configuration
- `modules/MMM-IsraelNews/README.md` - Documentation
- `modules/MMM-IsraelNews/test-update-fix.js` - Test script (new)

The fix follows the same pattern as the reference `newsfeed` module, ensuring reliable and consistent news updates. 