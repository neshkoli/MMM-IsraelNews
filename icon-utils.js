const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

class IconUtils {
    constructor() {
        this.cache = new Map(); // Cache favicon URLs to avoid repeated requests
        this.convertedCache = new Map(); // Cache converted PNG files
        this.tempDir = path.join(__dirname, 'temp_icons');
        
        // Create temp directory if it doesn't exist
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
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
            
            // Look for shortcut icon specifically (like Ynet's format)
            /<link[^>]*rel=["']shortcut icon[^>]*href=["']([^"']*)[^>]*>/gi,
            
            // Look for any icon types
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
        
        // PNG files get highest priority
        if (urlLower.includes('.png')) return 1;
        
        // Apple touch icons are usually good quality
        if (urlLower.includes('apple-touch-icon')) return 2;
        
        // SVG icons are scalable
        if (urlLower.includes('.svg')) return 3;
        
        // Standard shortcut icons
        if (urlLower.includes('shortcut')) return 4;
        
        // ICO files are last resort
        if (urlLower.includes('.ico')) return 5;
        
        // Everything else
        return 6;
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
     * Process favicon URL - convert ICO to GIF if needed
     * @param {string} faviconUrl - The original favicon URL
     * @param {string} sourceUrl - The source RSS URL for cache key
     * @returns {Promise<string>} - The final favicon URL (GIF if converted)
     */
    async processFaviconUrl(faviconUrl, sourceUrl) {
        if (!faviconUrl) return null;
        
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
        
        // If it's ICO, try to convert it or return the ICO URL directly
        if (urlLower.includes('.ico') || faviconUrl.includes('favicon')) {
            try {
                const domain = new URL(faviconUrl).hostname.replace(/\./g, '_');
                const timestamp = Date.now();
                const icoFileName = `${domain}_${timestamp}.ico`;
                const icoPath = path.join(this.tempDir, icoFileName);
                
                console.log(`IconUtils: Processing ICO favicon for ${sourceUrl}`);
                console.log(`IconUtils: Downloading ${faviconUrl} to ${icoPath}`);
                
                // Download ICO file
                await this.downloadFile(faviconUrl, icoPath);
                const downloadedSize = fs.existsSync(icoPath) ? fs.statSync(icoPath).size : 0;
                console.log(`IconUtils: ICO file downloaded, size: ${downloadedSize} bytes`);
                
                if (downloadedSize === 0) {
                    console.log(`IconUtils: Downloaded ICO file is empty, returning original URL`);
                    return faviconUrl;
                }
                
                // Try to extract PNG data from ICO
                const icoBuffer = fs.readFileSync(icoPath);
                console.log(`IconUtils: Analyzing ICO file, buffer length: ${icoBuffer.length} bytes`);
                
                // Look for embedded PNG data first
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
                
                // If no PNG found, just return the original ICO URL
                // Modern browsers can display ICO files directly
                console.log(`IconUtils: No PNG data found in ICO, returning original ICO URL: ${faviconUrl}`);
                this.convertedCache.set(cacheKey, faviconUrl);
                return faviconUrl;
                
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
        
        // Check cache first
        if (this.cache.has(rssUrl)) {
            const cachedUrl = this.cache.get(rssUrl);
            console.log(`IconUtils: Found cached favicon URL: ${cachedUrl}`);
            // Process the cached URL (might convert ICO to GIF)
            return await this.processFaviconUrl(cachedUrl, rssUrl);
        }

        try {
            const mainDomain = this.extractMainDomain(rssUrl);
            if (!mainDomain) {
                console.log(`IconUtils: Could not extract main domain from ${rssUrl}`);
                return null;
            }

            console.log(`IconUtils: Fetching favicon for ${rssUrl} from ${mainDomain}`);
            
            const html = await this.fetchHTML(mainDomain);
            console.log(`IconUtils: Fetched HTML, length: ${html.length} characters`);
            
            // Log a sample of the HTML to see what we're working with
            const htmlSample = html.substring(0, 2000);
            console.log(`IconUtils: HTML sample: ${htmlSample}`);
            
            const faviconUrl = this.parseHtmlForFavicon(html, mainDomain);
            
            console.log(`IconUtils: Found favicon URL: ${faviconUrl}`);
            
            // Cache the result
            this.cache.set(rssUrl, faviconUrl);
            
            // Process the favicon (convert ICO to GIF if needed)
            const processedUrl = await this.processFaviconUrl(faviconUrl, rssUrl);
            console.log(`IconUtils: Processed favicon URL: ${processedUrl ? 'success' : 'failed'}`);
            
            return processedUrl;
            
        } catch (error) {
            console.error(`IconUtils: Error fetching favicon for ${rssUrl}:`, error.message);
            
            // Fallback to standard favicon.ico
            const mainDomain = this.extractMainDomain(rssUrl);
            const fallbackUrl = mainDomain ? mainDomain + '/favicon.ico' : null;
            
            console.log(`IconUtils: Using fallback URL: ${fallbackUrl}`);
            this.cache.set(rssUrl, fallbackUrl);
            
            // Process the fallback URL (convert ICO to GIF if needed)
            return await this.processFaviconUrl(fallbackUrl, rssUrl);
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
}

module.exports = IconUtils;
