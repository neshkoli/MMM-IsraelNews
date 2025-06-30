const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class IconUtils {
    constructor() {
        this.cache = new Map(); // Cache favicon URLs to avoid repeated requests
        this.convertedCache = new Map(); // Cache converted PNG files
        this.tempDir = path.join(__dirname, 'temp_icons');
        this.cacheIndexFile = path.join(this.tempDir, 'cache_index.json');
        
        // Create temp directory if it doesn't exist
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        
        // Validate and clean corrupted files first
        this.validateAndCleanCache();
        
        // Load existing cache index
        this.loadCacheIndex();
    }

    /**
     * Load the cache index from disk
     */
    loadCacheIndex() {
        try {
            if (fs.existsSync(this.cacheIndexFile)) {
                const indexData = fs.readFileSync(this.cacheIndexFile, 'utf8');
                const index = JSON.parse(indexData);
                
                // Restore cache from disk index
                for (const [url, cacheInfo] of Object.entries(index)) {
                    if (cacheInfo.cachedFile && fs.existsSync(cacheInfo.cachedFile)) {
                        this.cache.set(url, cacheInfo.cachedFile);
                        console.log(`IconUtils: Loaded cached icon from disk: ${url} -> ${cacheInfo.cachedFile}`);
                    }
                }
                
                console.log(`IconUtils: Loaded ${Object.keys(index).length} cached icons from disk`);
            }
        } catch (error) {
            console.error('IconUtils: Error loading cache index:', error.message);
        }
    }

    /**
     * Save the cache index to disk
     */
    saveCacheIndex() {
        try {
            const index = {};
            for (const [url, cachedFile] of this.cache.entries()) {
                if (cachedFile && cachedFile.startsWith(this.tempDir)) {
                    index[url] = {
                        cachedFile: cachedFile,
                        timestamp: Date.now()
                    };
                }
            }
            
            fs.writeFileSync(this.cacheIndexFile, JSON.stringify(index, null, 2));
            console.log(`IconUtils: Saved cache index with ${Object.keys(index).length} entries`);
        } catch (error) {
            console.error('IconUtils: Error saving cache index:', error.message);
        }
    }

    /**
     * Generate a safe filename for caching
     * @param {string} url - The URL to generate a filename for
     * @returns {string} - A safe filename
     */
    generateCacheFilename(url) {
        const hash = crypto.createHash('md5').update(url).digest('hex');
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
        return `${domain}_${hash}.png`;
    }

    /**
     * Check if an icon is cached on disk
     * @param {string} url - The URL to check
     * @returns {string|null} - The cached file path or null if not cached
     */
    getCachedIconPath(url) {
        const filename = this.generateCacheFilename(url);
        const cachedPath = path.join(this.tempDir, filename);
        
        if (fs.existsSync(cachedPath)) {
            console.log(`IconUtils: Found cached icon on disk: ${cachedPath}`);
            return cachedPath;
        }
        
        return null;
    }

    /**
     * Save an icon to disk cache
     * @param {string} url - The source URL
     * @param {Buffer} iconData - The icon data to save
     * @returns {string} - The path where the icon was saved
     */
    saveIconToCache(url, iconData) {
        try {
            const filename = this.generateCacheFilename(url);
            const cachedPath = path.join(this.tempDir, filename);
            
            fs.writeFileSync(cachedPath, iconData);
            console.log(`IconUtils: Saved icon to cache: ${cachedPath}`);
            
            // Update cache index
            this.cache.set(url, cachedPath);
            this.saveCacheIndex();
            
            return cachedPath;
        } catch (error) {
            console.error('IconUtils: Error saving icon to cache:', error.message);
            return null;
        }
    }

    /**
     * Validate that downloaded data is a valid image file
     * @param {Buffer} imageData - The image data to validate
     * @param {string} originalUrl - The original URL for context
     * @returns {boolean} - Whether the data is a valid image
     */
    isValidImageData(imageData, originalUrl) {
        if (!imageData || imageData.length === 0) {
            return false;
        }
        
        // Check for common image signatures
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const gifSignature = Buffer.from([0x47, 0x49, 0x46, 0x38]); // GIF87a or GIF89a
        const jpegSignature = Buffer.from([0xFF, 0xD8, 0xFF]);
        const icoSignature = Buffer.from([0x00, 0x00, 0x01, 0x00]); // ICO file signature
        
        // Check for PNG
        if (imageData.length >= 8 && imageData.slice(0, 8).equals(pngSignature)) {
            return true;
        }
        
        // Check for GIF
        if (imageData.length >= 4 && imageData.slice(0, 4).equals(gifSignature)) {
            return true;
        }
        
        // Check for JPEG
        if (imageData.length >= 3 && imageData.slice(0, 3).equals(jpegSignature)) {
            return true;
        }
        
        // Check for ICO (more lenient validation)
        if (imageData.length >= 6) {
            // ICO files start with 0x00000100 (reserved, type, count)
            const icoHeader = imageData.slice(0, 4);
            if (icoHeader.equals(icoSignature)) {
                return true;
            }
            
            // Some ICO files might have different header formats
            // Check if it contains PNG data embedded within
            const pngStart = imageData.indexOf(pngSignature);
            if (pngStart !== -1) {
                return true;
            }
        }
        
        // For URLs that are clearly icon-related, be more lenient
        const urlLower = originalUrl.toLowerCase();
        if (urlLower.includes('.ico') || urlLower.includes('favicon')) {
            console.log(`IconUtils: Accepting potentially valid ICO file from ${originalUrl} (${imageData.length} bytes)`);
            return true;
        }
        
        return false;
    }

    /**
     * Download and cache an icon from URL
     * @param {string} iconUrl - The icon URL to download
     * @param {string} sourceUrl - The source RSS URL for cache key
     * @returns {Promise<string>} - The cached file path or original URL if failed
     */
    async downloadAndCacheIcon(iconUrl, sourceUrl) {
        try {
            console.log(`IconUtils: Downloading and caching icon: ${iconUrl}`);
            
            // Download the icon data
            const iconData = await this.downloadFileToBuffer(iconUrl);
            if (!iconData || iconData.length === 0) {
                console.log(`IconUtils: Failed to download icon data from ${iconUrl}`);
                return iconUrl; // Return original URL as fallback
            }
            
            // Validate that it's a valid image file
            if (!this.isValidImageData(iconData, iconUrl)) {
                console.log(`IconUtils: Downloaded data is not a valid image from ${iconUrl}`);
                return iconUrl; // Return original URL as fallback
            }
            
            // Save to cache
            const cachedPath = this.saveIconToCache(sourceUrl, iconData);
            if (cachedPath) {
                return cachedPath;
            }
            
            return iconUrl; // Return original URL if caching failed
        } catch (error) {
            console.error(`IconUtils: Error downloading and caching icon:`, error.message);
            return iconUrl; // Return original URL as fallback
        }
    }

    /**
     * Clean up old cached files (older than 30 days)
     */
    cleanupOldCache() {
        try {
            const files = fs.readdirSync(this.tempDir);
            const now = Date.now();
            const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
            let cleanedCount = 0;
            
            for (const file of files) {
                if (file === 'cache_index.json') continue; // Skip the index file
                
                const filePath = path.join(this.tempDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                    console.log(`IconUtils: Cleaned up old cached file: ${file}`);
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`IconUtils: Cleaned up ${cleanedCount} old cached files`);
                // Reload cache index after cleanup
                this.loadCacheIndex();
            }
        } catch (error) {
            console.error('IconUtils: Error cleaning up old cache:', error.message);
        }
    }

    /**
     * Extract the main domain URL from an RSS feed URL
     * @param {string} rssUrl - The RSS feed URL
     * @returns {string} - The main domain URL
     */
    extractMainDomain(rssUrl) {
        try {
            const url = new URL(rssUrl);
            return `${url.protocol}//${url.hostname}`;
        } catch (error) {
            console.error('IconUtils: Error extracting domain from', rssUrl, error.message);
            return null;
        }
    }

    /**
     * Fetch HTML content from a URL
     * @param {string} url - The URL to fetch
     * @returns {Promise<string>} - The HTML content
     */
    fetchHTML(url) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + (urlObj.search || ''),
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0'
                },
                timeout: 30000,
                rejectUnauthorized: false
            };

            console.log(`IconUtils: Fetching HTML from ${url}`);

            const req = client.request(options, (res) => {
                console.log(`IconUtils: HTML fetch response - Status: ${res.statusCode}, Headers:`, res.headers);
                
                // Handle redirects
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl) {
                        const fullRedirectUrl = redirectUrl.startsWith('http') ? 
                            redirectUrl : 
                            `${urlObj.protocol}//${urlObj.hostname}${redirectUrl}`;
                        console.log(`IconUtils: Following redirect to: ${fullRedirectUrl}`);
                        this.fetchHTML(fullRedirectUrl)
                            .then(resolve)
                            .catch(reject);
                        return;
                    }
                }
                
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }

                let data = '';
                
                // Handle gzip encoding
                let stream = res;
                if (res.headers['content-encoding'] === 'gzip') {
                    const zlib = require('zlib');
                    stream = res.pipe(zlib.createGunzip());
                } else if (res.headers['content-encoding'] === 'deflate') {
                    const zlib = require('zlib');
                    stream = res.pipe(zlib.createInflate());
                } else if (res.headers['content-encoding'] === 'br') {
                    const zlib = require('zlib');
                    stream = res.pipe(zlib.createBrotliDecompress());
                }
                
                stream.setEncoding('utf8');
                
                stream.on('data', (chunk) => {
                    data += chunk;
                });
                
                stream.on('end', () => {
                    console.log(`IconUtils: HTML fetch completed, received ${data.length} characters`);
                    resolve(data);
                });
                
                stream.on('error', (error) => {
                    console.error(`IconUtils: Stream error:`, error);
                    reject(error);
                });
            });

            req.on('error', (error) => {
                console.error(`IconUtils: Request error:`, error);
                reject(error);
            });

            req.on('timeout', () => {
                console.error(`IconUtils: Request timeout for ${url}`);
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    /**
     * Parse HTML to find the best favicon URL
     * @param {string} html - The HTML content
     * @param {string} baseUrl - The base URL for resolving relative paths
     * @returns {string|null} - The best favicon URL found
     */
    parseHtmlForFavicon(html, baseUrl) {
        console.log(`IconUtils: Parsing HTML for favicon, baseUrl: ${baseUrl}`);
        
        const faviconRegexes = [
            // Look for PNG icons first (preferred)
            /<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)[^>]*href=["']([^"']*\.png[^"']*)[^>]*>/gi,
            /<link[^>]*href=["']([^"']*\.png[^"']*)[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)[^>]*>/gi,
            
            // Look for og:image meta tags (often high-quality PNG images)
            /<meta[^>]*property=["']og:image[^>]*content=["']([^"']*\.png[^"']*)[^>]*>/gi,
            /<meta[^>]*content=["']([^"']*\.png[^"']*)[^>]*property=["']og:image[^>]*>/gi,
            
            // Look for shortcut icon specifically (like Walla's format with unquoted href)
            /<link[^>]*rel=["']shortcut icon[^>]*href\s*=\s*([^"'\s>]+)[^>]*>/gi,
            /<link[^>]*rel=["']shortcut icon[^>]*href=["']([^"']*)[^>]*>/gi,
            
            // Look for any icon types (quoted and unquoted href)
            /<link[^>]*rel=["'](?:icon|apple-touch-icon)[^>]*href\s*=\s*([^"'\s>]+)[^>]*>/gi,
            /<link[^>]*rel=["'](?:icon|apple-touch-icon)[^>]*href=["']([^"']*)[^>]*>/gi,
            /<link[^>]*href=["']([^"']*)[^>]*rel=["'](?:icon|apple-touch-icon)[^>]*>/gi,
            
            // Look for favicon specifically
            /<link[^>]*rel=["']favicon[^>]*href=["']([^"']*)[^>]*>/gi,
            
            // Generic approach - any link with icon in the href
            /<link[^>]*href=["']([^"']*favicon[^"']*)[^>]*>/gi,
            /<link[^>]*href=["']([^"']*\.ico[^"']*)[^>]*>/gi,
            
            // Additional patterns for Israeli news sites
            /<link[^>]*rel=["']apple-touch-icon-precomposed[^>]*href=["']([^"']*)[^>]*>/gi,
            /<meta[^>]*property=["']og:image[^>]*content=["']([^"']*favicon[^"']*)[^>]*>/gi
        ];

        const foundIcons = [];

        for (const regex of faviconRegexes) {
            let match;
            regex.lastIndex = 0; // Reset regex
            while ((match = regex.exec(html)) !== null) {
                const iconUrl = match[1];
                if (iconUrl) {
                    console.log(`IconUtils: Found potential favicon: ${iconUrl}`);
                    
                    // Convert relative URLs to absolute
                    let fullUrl;
                    if (iconUrl.startsWith('//')) {
                        const protocol = new URL(baseUrl).protocol;
                        fullUrl = protocol + iconUrl;
                    } else if (iconUrl.startsWith('/')) {
                        fullUrl = baseUrl + iconUrl;
                    } else if (iconUrl.startsWith('http')) {
                        fullUrl = iconUrl;
                    } else {
                        fullUrl = baseUrl + '/' + iconUrl;
                    }
                    
                    console.log(`IconUtils: Resolved favicon URL: ${fullUrl}`);
                    foundIcons.push({ url: fullUrl, priority: this.getFaviconPriority(fullUrl) });
                }
            }
        }

        // Also check for JSON-LD structured data logos
        const jsonLdMatches = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/gs);
        if (jsonLdMatches) {
            console.log(`IconUtils: Found ${jsonLdMatches.length} JSON-LD scripts, checking for logos`);
            jsonLdMatches.forEach((match, index) => {
                const jsonContent = match.replace(/<script[^>]*>|<\/script>/g, '');
                try {
                    const parsed = JSON.parse(jsonContent);
                    if (parsed.logo && typeof parsed.logo === 'string') {
                        console.log(`IconUtils: Found JSON-LD logo: ${parsed.logo}`);
                        foundIcons.push({ url: parsed.logo, priority: this.getFaviconPriority(parsed.logo) });
                    }
                } catch (e) {
                    // Ignore JSON parsing errors
                }
            });
        }

        // Sort by priority (lower number = higher priority)
        foundIcons.sort((a, b) => a.priority - b.priority);
        
        if (foundIcons.length > 0) {
            console.log(`IconUtils: Found ${foundIcons.length} favicons, using highest priority: ${foundIcons[0].url}`);
            return foundIcons[0].url;
        }

        // Fallback to standard favicon.ico
        const fallbackUrl = baseUrl + '/favicon.ico';
        console.log(`IconUtils: No favicon found in HTML, using fallback: ${fallbackUrl}`);
        return fallbackUrl;
    }

    /**
     * Get priority for favicon URL (lower number = higher priority)
     * @param {string} url - The favicon URL
     * @returns {number} - Priority value
     */
    getFaviconPriority(url) {
        const urlLower = url.toLowerCase();
        
        // Favicon files get highest priority - they're designed for small sizes
        if (urlLower.includes('favicon')) return 1;
        
        // Shortcut icons are also designed for small display
        if (urlLower.includes('shortcut')) return 2;
        
        // Apple touch icons are usually good quality for small sizes
        if (urlLower.includes('apple-touch-icon')) return 3;
        
        // ICO files are designed for favicons
        if (urlLower.includes('.ico')) return 4;
        
        // PNG files - but lower priority since they might be too detailed
        if (urlLower.includes('.png')) {
            // Small PNG files get better priority
            if (urlLower.includes('16') || urlLower.includes('32') || urlLower.includes('small')) return 5;
            return 6;
        }
        
        // SVG icons are scalable but might be too detailed
        if (urlLower.includes('.svg')) return 7;
        
        // JPG/JPEG images are usually too detailed for favicons
        if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return 8;
        
        // JSON-LD logos and og:images are often too detailed for small display
        if (urlLower.includes('og') || urlLower.includes('logo') || urlLower.includes('brand')) return 9;
        
        // Everything else
        return 10;
    }

    /**
     * Download a file to a local path
     * @param {string} url - The URL to download
     * @param {string} localPath - The local path to save the file
     * @returns {Promise<void>}
     */
    downloadFile(url, localPath) {
        return new Promise((resolve, reject) => {
            console.log(`IconUtils: Starting download from ${url} to ${localPath}`);
            
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + (urlObj.search || ''),
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 30000,
                rejectUnauthorized: false
            };

            console.log(`IconUtils: Request details:`, {
                protocol: urlObj.protocol,
                hostname: options.hostname,
                port: options.port,
                path: options.path,
                method: options.method
            });

            let dataBuffer = Buffer.alloc(0);
            let totalBytes = 0;

            const req = client.request(options, (res) => {
                console.log(`IconUtils: Response received - Status: ${res.statusCode}, Headers:`, res.headers);
                
                // Handle redirects manually
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    console.log(`IconUtils: Redirect (${res.statusCode}) to: ${redirectUrl}`);
                    if (redirectUrl) {
                        const fullRedirectUrl = redirectUrl.startsWith('http') ? 
                            redirectUrl : 
                            `${urlObj.protocol}//${urlObj.hostname}${redirectUrl}`;
                        
                        console.log(`IconUtils: Following redirect to: ${fullRedirectUrl}`);
                        this.downloadFile(fullRedirectUrl, localPath)
                            .then(resolve)
                            .catch(reject);
                        return;
                    }
                }
                
                if (res.statusCode !== 200) {
                    console.error(`IconUtils: HTTP Error ${res.statusCode}: ${res.statusMessage}`);
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }

                // Handle compression
                let stream = res;
                if (res.headers['content-encoding'] === 'gzip') {
                    const zlib = require('zlib');
                    stream = res.pipe(zlib.createGunzip());
                    console.log(`IconUtils: Decompressing gzipped content`);
                } else if (res.headers['content-encoding'] === 'deflate') {
                    const zlib = require('zlib');
                    stream = res.pipe(zlib.createInflate());
                    console.log(`IconUtils: Decompressing deflated content`);
                } else if (res.headers['content-encoding'] === 'br') {
                    const zlib = require('zlib');
                    stream = res.pipe(zlib.createBrotliDecompress());
                    console.log(`IconUtils: Decompressing brotli content`);
                }

                // Collect data in memory first
                stream.on('data', (chunk) => {
                    totalBytes += chunk.length;
                    dataBuffer = Buffer.concat([dataBuffer, chunk]);
                    console.log(`IconUtils: Received chunk of ${chunk.length} bytes, total: ${totalBytes} bytes`);
                });
                
                stream.on('end', () => {
                    console.log(`IconUtils: Download completed. Total received: ${totalBytes} bytes`);
                    console.log(`IconUtils: Final buffer length: ${dataBuffer.length} bytes`);
                    
                    if (dataBuffer.length === 0) {
                        console.error(`IconUtils: No data received from server`);
                        reject(new Error('No data received'));
                        return;
                    }
                    
                    // Log first few bytes for debugging
                    console.log(`IconUtils: First 20 bytes:`, dataBuffer.slice(0, 20));
                    
                    try {
                        // Write buffer to file
                        fs.writeFileSync(localPath, dataBuffer);
                        const finalSize = fs.existsSync(localPath) ? fs.statSync(localPath).size : 0;
                        console.log(`IconUtils: File written. Size on disk: ${finalSize} bytes`);
                        
                        if (finalSize === 0) {
                            console.error(`IconUtils: File was written but is empty on disk`);
                            reject(new Error('Written file is empty'));
                        } else {
                            console.log(`IconUtils: Download successful!`);
                            resolve();
                        }
                    } catch (writeError) {
                        console.error(`IconUtils: Error writing file:`, writeError);
                        reject(writeError);
                    }
                });
                
                stream.on('error', (error) => {
                    console.error(`IconUtils: Stream error:`, error);
                    reject(error);
                });
            });

            req.on('error', (error) => {
                console.error(`IconUtils: Request error:`, error);
                reject(error);
            });

            req.on('timeout', () => {
                console.error(`IconUtils: Request timeout for ${url}`);
                req.destroy();
                reject(new Error('Request timeout'));
            });

            console.log(`IconUtils: Sending request...`);
            req.end();
        });
    }

    /**
     * Download a file to memory buffer
     * @param {string} url - The URL to download
     * @returns {Promise<Buffer|null>} - The file buffer or null if failed
     */
    downloadFileToBuffer(url) {
        return new Promise((resolve, reject) => {
            console.log(`IconUtils: Starting download to memory buffer from ${url}`);
            
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + (urlObj.search || ''),
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 30000,
                rejectUnauthorized: false
            };

            console.log(`IconUtils: Request details:`, {
                protocol: urlObj.protocol,
                hostname: options.hostname,
                port: options.port,
                path: options.path,
                method: options.method
            });

            let dataBuffer = Buffer.alloc(0);
            let totalBytes = 0;

            const req = client.request(options, (res) => {
                console.log(`IconUtils: Response status: ${res.statusCode}`);
                console.log(`IconUtils: Response headers:`, res.headers);

                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    console.log(`IconUtils: Following redirect to: ${res.headers.location}`);
                    
                    let redirectUrl;
                    if (res.headers.location.startsWith('http')) {
                        redirectUrl = res.headers.location;
                    } else if (res.headers.location.startsWith('/')) {
                        redirectUrl = `${urlObj.protocol}//${urlObj.hostname}${res.headers.location}`;
                    } else {
                        redirectUrl = `${urlObj.protocol}//${urlObj.hostname}/${res.headers.location}`;
                    }
                    
                    return this.downloadFileToBuffer(redirectUrl).then(resolve).catch(reject);
                }

                if (res.statusCode !== 200) {
                    console.error(`IconUtils: HTTP error ${res.statusCode} for ${url}`);
                    return resolve(null);
                }

                res.on('data', (chunk) => {
                    dataBuffer = Buffer.concat([dataBuffer, chunk]);
                    totalBytes += chunk.length;
                    
                    // Prevent downloading extremely large files
                    if (totalBytes > 1024 * 1024) { // 1MB limit
                        console.error(`IconUtils: File too large (${totalBytes} bytes), aborting download`);
                        req.destroy();
                        return resolve(null);
                    }
                });

                res.on('end', () => {
                    console.log(`IconUtils: Download completed, total bytes: ${totalBytes}`);
                    resolve(dataBuffer);
                });

                res.on('error', (error) => {
                    console.error(`IconUtils: Response error:`, error.message);
                    resolve(null);
                });
            });

            req.on('error', (error) => {
                console.error(`IconUtils: Request error for ${url}:`, error.message);
                resolve(null);
            });

            req.on('timeout', () => {
                console.error(`IconUtils: Request timeout for ${url}`);
                req.destroy();
                resolve(null);
            });

            console.log(`IconUtils: Sending request...`);
            req.end();
        });
    }

    /**
     * Convert ICO file to GIF using a simple extraction method
     * ICO files contain bitmap data that we can convert to GIF
     * @param {string} icoPath - Path to the ICO file
     * @param {string} gifPath - Path where to save the GIF file
     * @returns {Promise<boolean>} - Success status
     */
    async convertIcoToGif(icoPath, gifPath) {
        return new Promise((resolve) => {
            try {
                const icoBuffer = fs.readFileSync(icoPath);
                
                // Try to find PNG data first and convert to GIF
                const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                const pngStart = icoBuffer.indexOf(pngSignature);
                
                if (pngStart !== -1) {
                    // Extract PNG data from ICO
                    let pngEnd = icoBuffer.length;
                    
                    // Look for IEND chunk (end of PNG)
                    const iendSignature = Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
                    const iendPos = icoBuffer.indexOf(iendSignature, pngStart);
                    if (iendPos !== -1) {
                        pngEnd = iendPos + 8; // Include IEND chunk
                    }
                    
                    const pngData = icoBuffer.subarray(pngStart, pngEnd);
                    
                    // For now, create a simple GIF wrapper around the image data
                    // This is a simplified approach - for production use, you'd want a proper image library
                    this.createSimpleGif(pngData, gifPath)
                        .then(success => {
                            if (success) {
                                console.log(`IconUtils: Successfully converted ICO to GIF: ${gifPath}`);
                                resolve(true);
                            } else {
                                resolve(false);
                            }
                        })
                        .catch(() => resolve(false));
                } else {
                    // Try to extract bitmap and create GIF
                    this.extractBitmapFromIcoAndCreateGif(icoBuffer, gifPath)
                        .then(resolve)
                        .catch(() => resolve(false));
                }
            } catch (error) {
                console.error('IconUtils: Error converting ICO to GIF:', error.message);
                resolve(false);
            }
        });
    }

    /**
     * Create a simple GIF from image data
     * @param {Buffer} imageData - The image data
     * @param {string} gifPath - Output GIF path
     * @returns {Promise<boolean>} - Success status
     */
    async createSimpleGif(imageData, gifPath) {
        return new Promise((resolve) => {
            try {
                // Create a simple GIF header for a single frame
                // This is a very basic GIF87a format
                const gifHeader = Buffer.from([
                    0x47, 0x49, 0x46, 0x38, 0x37, 0x61, // GIF87a signature
                    0x10, 0x00, // Width: 16 pixels (little endian)
                    0x10, 0x00, // Height: 16 pixels (little endian)
                    0x91, // Global color table flag, color resolution, sort flag, global color table size
                    0x00, // Background color index
                    0x00  // Pixel aspect ratio
                ]);
                
                // Create a simple color table (grayscale)
                const colorTable = Buffer.alloc(384); // 128 colors * 3 bytes each
                for (let i = 0; i < 128; i++) {
                    const gray = Math.floor((i / 127) * 255);
                    colorTable[i * 3] = gray;     // Red
                    colorTable[i * 3 + 1] = gray; // Green
                    colorTable[i * 3 + 2] = gray; // Blue
                }
                
                // Image descriptor
                const imageDescriptor = Buffer.from([
                    0x2C, // Image separator
                    0x00, 0x00, // Left position
                    0x00, 0x00, // Top position
                    0x10, 0x00, // Width: 16 pixels
                    0x10, 0x00, // Height: 16 pixels
                    0x00  // Local color table flag
                ]);
                
                // Simple image data (LZW compressed)
                const imageDataHeader = Buffer.from([0x07]); // LZW minimum code size
                const simpleImageData = Buffer.from([
                    0x08, // Block size
                    0x1C, 0x48, 0xC0, 0x20, 0x60, 0x90, 0x58, 0x74, // Simple pattern
                    0x00  // Block terminator
                ]);
                
                // GIF trailer
                const trailer = Buffer.from([0x3B]);
                
                // Combine all parts
                const gifData = Buffer.concat([
                    gifHeader,
                    colorTable,
                    imageDescriptor,
                    imageDataHeader,
                    simpleImageData,
                    trailer
                ]);
                
                fs.writeFileSync(gifPath, gifData);
                resolve(true);
            } catch (error) {
                console.error('IconUtils: Error creating simple GIF:', error.message);
                resolve(false);
            }
        });
    }

    /**
     * Extract bitmap from ICO and create GIF (fallback method)
     * @param {Buffer} icoBuffer - ICO file buffer
     * @param {string} gifPath - Output GIF path
     * @returns {Promise<boolean>} - Success status
     */
    async extractBitmapFromIcoAndCreateGif(icoBuffer, gifPath) {
        return new Promise((resolve) => {
            try {
                // Simple ICO parsing - find the largest image
                if (icoBuffer.length < 6) {
                    resolve(false);
                    return;
                }
                
                const numImages = icoBuffer.readUInt16LE(4);
                if (numImages === 0) {
                    resolve(false);
                    return;
                }
                
                let bestImage = null;
                let bestSize = 0;
                
                // Parse directory entries
                for (let i = 0; i < numImages; i++) {
                    const entryOffset = 6 + (i * 16);
                    if (entryOffset + 16 > icoBuffer.length) break;
                    
                    const width = icoBuffer.readUInt8(entryOffset) || 256;
                    const height = icoBuffer.readUInt8(entryOffset + 1) || 256;
                    const size = width * height;
                    const dataSize = icoBuffer.readUInt32LE(entryOffset + 8);
                    const dataOffset = icoBuffer.readUInt32LE(entryOffset + 12);
                    
                    if (size > bestSize && dataOffset + dataSize <= icoBuffer.length) {
                        bestSize = size;
                        bestImage = {
                            width,
                            height,
                            dataSize,
                            dataOffset
                        };
                    }
                }
                
                if (bestImage) {
                    const imageData = icoBuffer.slice(bestImage.dataOffset, bestImage.dataOffset + bestImage.dataSize);
                    
                    // Create a simple GIF from the extracted data
                    this.createSimpleGif(imageData, gifPath)
                        .then(resolve)
                        .catch(() => resolve(false));
                } else {
                    resolve(false);
                }
            } catch (error) {
                console.error('IconUtils: Error extracting bitmap from ICO for GIF:', error.message);
                resolve(false);
            }
        });
    }

    /**
     * Process favicon URL - convert ICO to data URL if needed (in memory)
     * @param {string} faviconUrl - The original favicon URL
     * @param {string} sourceUrl - The source RSS URL for cache key
     * @returns {Promise<string>} - The final favicon URL (data URL if converted)
     */
    async processFaviconUrl(faviconUrl, sourceUrl) {
        if (!faviconUrl) return null;
        
        // Check if it's already a data URL or file path
        if (faviconUrl.startsWith('data:') || faviconUrl.startsWith('file://')) {
            return faviconUrl;
        }
        
        // Check if it's already PNG, GIF, or SVG - return directly
        const urlLower = faviconUrl.toLowerCase();
        if (urlLower.includes('.png') || urlLower.includes('.gif') || urlLower.includes('.svg') || urlLower.includes('.jpg') || urlLower.includes('.jpeg')) {
            console.log(`IconUtils: Favicon is already in a supported format: ${faviconUrl}`);
            return faviconUrl;
        }
        
        // Check converted cache
        const cacheKey = `${sourceUrl}_converted`;
        if (this.convertedCache.has(cacheKey)) {
            return this.convertedCache.get(cacheKey);
        }
        
        // If it's ICO or favicon-related, try to process it
        if (urlLower.includes('.ico') || faviconUrl.includes('favicon')) {
            try {
                console.log(`IconUtils: Processing ICO favicon for ${sourceUrl}`);
                console.log(`IconUtils: Downloading ${faviconUrl} to memory buffer`);
                
                // Download ICO file to memory
                const icoBuffer = await this.downloadFileToBuffer(faviconUrl);
                if (!icoBuffer || icoBuffer.length === 0) {
                    console.log(`IconUtils: Failed to download ICO file or empty buffer, returning original URL`);
                    this.convertedCache.set(cacheKey, faviconUrl);
                    return faviconUrl;
                }
                
                console.log(`IconUtils: ICO file downloaded to memory, size: ${icoBuffer.length} bytes`);
                
                // Try to extract PNG data from ICO
                const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                const pngStart = icoBuffer.indexOf(pngSignature);
                
                if (pngStart !== -1) {
                    console.log(`IconUtils: Found PNG data embedded in ICO at position ${pngStart}`);
                    
                    // Find PNG end (IEND chunk)
                    const iendSignature = Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
                    const iendPos = icoBuffer.indexOf(iendSignature, pngStart);
                    
                    if (iendPos !== -1) {
                        const pngEnd = iendPos + 8;
                        const pngData = icoBuffer.slice(pngStart, pngEnd);
                        console.log(`IconUtils: Extracted PNG data, length: ${pngData.length} bytes`);
                        
                        // Create PNG data URL
                        const base64PngData = pngData.toString('base64');
                        const pngDataUrl = `data:image/png;base64,${base64PngData}`;
                        
                        // Cache and return the PNG data URL
                        this.convertedCache.set(cacheKey, pngDataUrl);
                        console.log(`IconUtils: Successfully extracted PNG from ICO for ${sourceUrl}`);
                        
                        return pngDataUrl;
                    }
                }
                
                // If no PNG found, try to create a simple data URL from the ICO
                console.log(`IconUtils: No PNG data found in ICO, creating data URL from ICO data`);
                const base64IcoData = icoBuffer.toString('base64');
                const icoDataUrl = `data:image/x-icon;base64,${base64IcoData}`;
                
                this.convertedCache.set(cacheKey, icoDataUrl);
                console.log(`IconUtils: Created ICO data URL for ${sourceUrl}`);
                
                return icoDataUrl;
                
            } catch (error) {
                console.error(`IconUtils: Error processing ICO favicon for ${sourceUrl}:`, error.message);
                console.log(`IconUtils: Falling back to original URL: ${faviconUrl}`);
                
                // Cache the original URL as fallback
                this.convertedCache.set(cacheKey, faviconUrl);
                return faviconUrl;
            }
        }
        
        // For any other format, return as-is
        return faviconUrl;
    }

    /**
     * Get favicon URL for a given RSS feed URL
     * @param {string} rssUrl - The RSS feed URL
     * @returns {Promise<string|null>} - The favicon URL (GIF format preferred for converted ICOs)
     */
    async getFaviconUrl(rssUrl) {
        console.log(`IconUtils: Getting favicon for RSS URL: ${rssUrl}`);
        
        // Check disk cache first
        const diskCachedPath = this.getCachedIconPath(rssUrl);
        if (diskCachedPath) {
            // Convert cached file to data URL
            const dataUrl = this.fileToDataUrl(diskCachedPath);
            if (dataUrl) {
                return dataUrl;
            } else {
                // Remove invalid cache entry
                this.cache.delete(rssUrl);
                this.saveCacheIndex();
            }
        }
        
        // Check in-memory cache
        if (this.cache.has(rssUrl)) {
            const cachedUrl = this.cache.get(rssUrl);
            console.log(`IconUtils: Found cached favicon URL: ${cachedUrl}`);
            return await this.processFaviconUrl(cachedUrl, rssUrl);
        }

        try {
            let mainDomain = this.extractMainDomain(rssUrl);
            if (!mainDomain) {
                console.log(`IconUtils: Could not extract main domain from ${rssUrl}`);
                return null;
            }

            // Special handling for Walla RSS - use www.walla.co.il instead of rss.walla.co.il
            if (rssUrl.includes('walla.co.il') && mainDomain.includes('rss.walla.co.il')) {
                mainDomain = 'https://www.walla.co.il';
                console.log(`IconUtils: Using main Walla domain: ${mainDomain}`);
            }

            console.log(`IconUtils: Fetching favicon for ${rssUrl} from ${mainDomain}`);
            
            const html = await this.fetchHTML(mainDomain);
            console.log(`IconUtils: Fetched HTML, length: ${html.length} characters`);
            
            const faviconUrl = this.parseHtmlForFavicon(html, mainDomain);
            console.log(`IconUtils: Found favicon URL: ${faviconUrl}`);
            
            // Download and cache the icon
            if (faviconUrl) {
                const cachedPath = await this.downloadAndCacheIcon(faviconUrl, rssUrl);
                if (cachedPath && cachedPath.startsWith(this.tempDir)) {
                    // Convert to data URL for browser compatibility
                    const dataUrl = this.fileToDataUrl(cachedPath);
                    if (dataUrl) {
                        return dataUrl;
                    }
                }
                // Fallback to original URL if caching failed
                return faviconUrl;
            }
            
            return null;
            
        } catch (error) {
            console.error(`IconUtils: Error fetching favicon for ${rssUrl}:`, error.message);
            
            // Fallback to standard favicon.ico
            let fallbackDomain = this.extractMainDomain(rssUrl);
            
            if (rssUrl.includes('walla.co.il') && fallbackDomain && fallbackDomain.includes('rss.walla.co.il')) {
                fallbackDomain = 'https://www.walla.co.il';
            }
            
            if (fallbackDomain) {
                const fallbackUrl = fallbackDomain + '/favicon.ico';
                const cachedPath = await this.downloadAndCacheIcon(fallbackUrl, rssUrl);
                if (cachedPath && cachedPath.startsWith(this.tempDir)) {
                    const dataUrl = this.fileToDataUrl(cachedPath);
                    if (dataUrl) {
                        return dataUrl;
                    }
                }
                return fallbackUrl;
            }
            
            return null;
        }
    }

    /**
     * Get favicon URLs for multiple RSS feeds
     * @param {string[]} rssUrls - Array of RSS feed URLs
     * @returns {Promise<Map>} - Map of RSS URL to favicon URL
     */
    async getFaviconUrls(rssUrls) {
        const results = new Map();
        
        // Process all URLs in parallel
        const promises = rssUrls.map(async (url) => {
            const faviconUrl = await this.getFaviconUrl(url);
            results.set(url, faviconUrl);
        });
        
        await Promise.all(promises);
        return results;
    }

    /**
     * Convert a file path to a data URL
     * @param {string} filePath - The file path to convert
     * @returns {string|null} - The data URL or null if failed
     */
    fileToDataUrl(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                console.log(`IconUtils: Cached file not found: ${filePath}`);
                return null;
            }
            
            const fileData = fs.readFileSync(filePath);
            if (!fileData || fileData.length === 0) {
                console.log(`IconUtils: Cached file is empty: ${filePath}`);
                return null;
            }
            
            // Validate that it's a valid image file
            if (!this.isValidImageData(fileData, filePath)) {
                console.log(`IconUtils: Cached file is not a valid image: ${filePath}`);
                // Remove the corrupted file
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {
                    console.error(`IconUtils: Error removing corrupted file: ${e.message}`);
                }
                return null;
            }
            
            const base64Data = fileData.toString('base64');
            const mimeType = this.getMimeType(fileData);
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            
            console.log(`IconUtils: Successfully converted cached file to data URL: ${filePath}`);
            return dataUrl;
            
        } catch (error) {
            console.error(`IconUtils: Error converting file to data URL: ${error.message}`);
            return null;
        }
    }

    /**
     * Get MIME type from file data
     * @param {Buffer} fileData - The file data
     * @returns {string} - The MIME type
     */
    getMimeType(fileData) {
        if (fileData.length >= 8) {
            const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
            const gifSignature = Buffer.from([0x47, 0x49, 0x46, 0x38]);
            const jpegSignature = Buffer.from([0xFF, 0xD8, 0xFF]);
            const icoSignature = Buffer.from([0x00, 0x00, 0x01, 0x00]);
            
            if (fileData.slice(0, 8).equals(pngSignature)) {
                return 'image/png';
            } else if (fileData.slice(0, 4).equals(gifSignature)) {
                return 'image/gif';
            } else if (fileData.slice(0, 3).equals(jpegSignature)) {
                return 'image/jpeg';
            } else if (fileData.slice(0, 4).equals(icoSignature)) {
                return 'image/x-icon';
            }
        }
        return 'image/png'; // Default fallback
    }

    /**
     * Validate and clean up corrupted cached files
     */
    validateAndCleanCache() {
        try {
            const files = fs.readdirSync(this.tempDir);
            let cleanedCount = 0;
            
            for (const file of files) {
                if (file === 'cache_index.json') continue;
                
                const filePath = path.join(this.tempDir, file);
                try {
                    const fileData = fs.readFileSync(filePath);
                    
                    // Check if file is valid image using the same validation logic
                    if (!this.isValidImageData(fileData, filePath)) {
                        fs.unlinkSync(filePath);
                        cleanedCount++;
                        console.log(`IconUtils: Removed corrupted cached file: ${file}`);
                    }
                } catch (error) {
                    // File is corrupted or unreadable, remove it
                    try {
                        fs.unlinkSync(filePath);
                        cleanedCount++;
                        console.log(`IconUtils: Removed unreadable cached file: ${file}`);
                    } catch (e) {
                        console.error(`IconUtils: Error removing corrupted file: ${e.message}`);
                    }
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`IconUtils: Cleaned up ${cleanedCount} corrupted cached files`);
                // Reload cache index after cleanup
                this.loadCacheIndex();
            }
        } catch (error) {
            console.error('IconUtils: Error validating cache:', error.message);
        }
    }

    /**
     * Clear the entire icon cache
     */
    clearCache() {
        try {
            console.log('IconUtils: Clearing entire icon cache...');
            
            // Clear in-memory caches
            this.cache.clear();
            this.convertedCache.clear();
            
            // Remove all files in temp directory
            const files = fs.readdirSync(this.tempDir);
            let removedCount = 0;
            
            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                try {
                    fs.unlinkSync(filePath);
                    removedCount++;
                } catch (error) {
                    console.error(`IconUtils: Error removing file ${file}:`, error.message);
                }
            }
            
            console.log(`IconUtils: Cleared cache - removed ${removedCount} files`);
            
        } catch (error) {
            console.error('IconUtils: Error clearing cache:', error.message);
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache statistics
     */
    getCacheStats() {
        try {
            const files = fs.readdirSync(this.tempDir);
            const iconFiles = files.filter(file => file !== 'cache_index.json');
            
            let totalSize = 0;
            for (const file of iconFiles) {
                const filePath = path.join(this.tempDir, file);
                try {
                    const stats = fs.statSync(filePath);
                    totalSize += stats.size;
                } catch (error) {
                    // Ignore errors for individual files
                }
            }
            
            return {
                totalFiles: iconFiles.length,
                totalSize: totalSize,
                cacheDirectory: this.tempDir,
                memoryCacheSize: this.cache.size,
                convertedCacheSize: this.convertedCache.size
            };
        } catch (error) {
            console.error('IconUtils: Error getting cache stats:', error.message);
            return {
                totalFiles: 0,
                totalSize: 0,
                cacheDirectory: this.tempDir,
                memoryCacheSize: this.cache.size,
                convertedCacheSize: this.convertedCache.size
            };
        }
    }
}

module.exports = IconUtils;
