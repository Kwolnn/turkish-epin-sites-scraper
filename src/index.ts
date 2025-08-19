import express from 'express';
import { HttpOrchestrator } from './http-orchestrator';
import path from 'path';

// Global scraping status and results
let scrapingStatus = {
  isRunning: false,
  currentBatch: null,
  progress: 0,
  lastUpdate: new Date().toISOString(),
  totalUrls: 0,
  processedUrls: 0,
  successCount: 0,
  failedCount: 0,
  totalItems: 0
};

let lastBatchResult: any = null;
let failedUrls: Array<{url: string, error: string, timestamp: string}> = [];

const app = express();
const port = Number(process.env.PORT) || 4000;
const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://n8n:5678/webhook/game-data';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Game Price Scraper'
  });
});

// Synchronous scraping endpoint for N8N integration
app.post('/scrape/sync', async (req, res) => {
  try {
    console.log('🚀 Starting synchronous scraping for N8N...');
    
    // Extract URLs from request body
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'URLs array is required in request body'
      });
    }

    // Validate URLs
    const validUrls = urls.filter((url: any) => 
      typeof url === 'string' && url.startsWith('http')
    );

    if (validUrls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid URLs provided'
      });
    }

    console.log(`📝 Processing ${validUrls.length} URLs synchronously...`);

    // Initialize orchestrator
    const orchestrator = new HttpOrchestrator(n8nWebhookUrl);
    await orchestrator.initialize();
    
    // Run synchronous scraping
    const result = await orchestrator.scrapeUrls(validUrls);
    
    await orchestrator.close();
    
    // Prepare response data
    const scrapedItems = result.results
      .filter(r => r.success && r.items.length > 0)
      .flatMap(r => r.items.map(item => ({
        title: item.title,
        price: item.price,
        currency: item.currency,
        region: item.region,
        url: item.url,
        siteName: item.siteName,
        gameSlug: item.gameSlug
      })));

    console.log(`✅ Scraping completed: ${scrapedItems.length} items from ${result.successCount}/${result.totalUrls} URLs`);

    // Update dashboard items
    dashboardItems = scrapedItems;

    // Return scraped data immediately
    return res.json({
      success: true,
      message: 'Scraping completed successfully',
      data: {
        batchId: result.batchId,
        timestamp: result.timestamp.toISOString(),
        summary: {
          totalUrls: result.totalUrls,
          successCount: result.successCount,
          failedCount: result.failedCount,
          totalItems: scrapedItems.length
        },
        items: scrapedItems,
        errors: result.errors
      }
    });
    
  } catch (error) {
    console.error('❌ Synchronous scraping failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Asynchronous scraping endpoint (original)
app.post('/scrape/start', async (req, res) => {
  try {
    // Check if already running - return current progress instead of error
    if (scrapingStatus.isRunning) {
      const progressPercentage = scrapingStatus.totalUrls > 0 
        ? Math.round((scrapingStatus.processedUrls / scrapingStatus.totalUrls) * 100)
        : scrapingStatus.progress;
        
      return res.json({
        success: true,
        message: 'Scraping job is already running',
        isRunning: true,
        progress: progressPercentage,
        currentStatus: {
          ...scrapingStatus,
          progressPercentage,
          hasFailedUrls: failedUrls.length > 0,
          failedUrlCount: failedUrls.length
        }
      });
    }

    console.log('🚀 Starting async scraping job...');
    
    // Reset status and failed URLs
    scrapingStatus = {
      isRunning: true,
      currentBatch: null,
      progress: 0,
      lastUpdate: new Date().toISOString(),
      totalUrls: 0,
      processedUrls: 0,
      successCount: 0,
      failedCount: 0,
      totalItems: 0
    };
    failedUrls = [];
    
    // Immediate response to avoid timeout
    res.json({
      success: true,
      message: 'Scraping job started - check /scrape/status for progress',
      timestamp: new Date().toISOString(),
      statusEndpoint: '/scrape/status',
      failedUrlsEndpoint: '/scrape/failed-urls'
    });
    
    // Run scraping in background
    setImmediate(async () => {
      try {
        const orchestrator = new HttpOrchestrator(n8nWebhookUrl);
        
        // Set resume URL if provided in request
        if (req.body.resumeUrl) {
          orchestrator.setResumeUrl(req.body.resumeUrl);
          console.log(`🔗 Resume URL set: ${req.body.resumeUrl}`);
        }
        
        await orchestrator.initialize();
        
        scrapingStatus.progress = 5;
        scrapingStatus.lastUpdate = new Date().toISOString();
        
        // Progress callback function
        const updateProgress = (processed: number, total: number) => {
          scrapingStatus.processedUrls = processed;
          scrapingStatus.totalUrls = total;
          scrapingStatus.progress = Math.round((processed / total) * 90) + 10; // 10-100%
          scrapingStatus.lastUpdate = new Date().toISOString();
        };

        // Use custom URLs or default file
        let result;
        if (req.body.urls && Array.isArray(req.body.urls)) {
          scrapingStatus.totalUrls = req.body.urls.length;
          result = await orchestrator.scrapeUrls(req.body.urls, updateProgress);
        } else {
          const urlsFile = path.join(__dirname, '..', 'urls.txt');
          // Count URLs first
          try {
            const fs = await import('fs/promises');
            const content = await fs.readFile(urlsFile, 'utf-8');
            const urls = content.split('\n').map(line => line.trim()).filter(line => line.length > 0 && line.startsWith('http'));
            scrapingStatus.totalUrls = urls.length;
          } catch (e) {
            console.warn('Could not count URLs:', e);
          }
          result = await orchestrator.scrapeFromFile(urlsFile, updateProgress);
        }
        
        await orchestrator.close();
        
        // Update final status
        scrapingStatus.isRunning = false;
        scrapingStatus.progress = 100;
        scrapingStatus.currentBatch = result.batchId;
        scrapingStatus.processedUrls = result.totalUrls;
        scrapingStatus.successCount = result.successCount;
        scrapingStatus.failedCount = result.failedCount;
        scrapingStatus.totalItems = result.totalItems;
        scrapingStatus.lastUpdate = new Date().toISOString();
        
        // Store failed URLs
        failedUrls = result.results
          .filter(r => !r.success)
          .map(r => ({
            url: r.url,
            error: r.error || 'Unknown error',
            timestamp: new Date().toISOString()
          }));
        
        // Store complete result
        lastBatchResult = result;
        
        console.log('✅ Scraping completed:', {
          batchId: result.batchId,
          totalItems: result.totalItems,
          successCount: result.successCount,
          failedCount: result.failedCount
        });
        
      } catch (error) {
        scrapingStatus.isRunning = false;
        scrapingStatus.progress = -1; // Indicate error
        scrapingStatus.lastUpdate = new Date().toISOString();
        console.error('❌ Scraping job failed:', error);
        
        // Store error info
        failedUrls.push({
          url: 'SYSTEM_ERROR',
          error: error instanceof Error ? error.message : 'Unknown system error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Background task started successfully
    return undefined;
    
  } catch (error) {
    console.error('❌ Scraping job failed to start:', error);
    scrapingStatus.isRunning = false;
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get scraping status
app.get('/scrape/status', (req, res) => {
  const progressPercentage = scrapingStatus.totalUrls > 0 
    ? Math.round((scrapingStatus.processedUrls / scrapingStatus.totalUrls) * 100)
    : scrapingStatus.progress;
    
  res.json({
    ...scrapingStatus,
    progressPercentage,
    hasFailedUrls: failedUrls.length > 0,
    failedUrlCount: failedUrls.length,
    timestamp: new Date().toISOString()
  });
});

// Get failed URLs
app.get('/scrape/failed-urls', (req, res) => {
  res.json({
    success: true,
    failedUrls,
    count: failedUrls.length,
    timestamp: new Date().toISOString()
  });
});

// Get last batch results
app.get('/scrape/last-result', (req, res) => {
  if (!lastBatchResult) {
    return res.status(404).json({
      success: false,
      error: 'No batch results available'
    });
  }
  
  return res.json({
    success: true,
    result: lastBatchResult,
    timestamp: new Date().toISOString()
  });
});

// Test N8N connection
app.get('/test/n8n', async (req, res) => {
  try {
    const { N8NClient } = await import('./utils/n8n-client');
    const client = new N8NClient(n8nWebhookUrl);
    const connected = await client.testConnection();
    
    res.json({
      success: connected,
      webhookUrl: n8nWebhookUrl,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Store prices from N8N
app.post('/api/prices/store', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    
    console.log(`📥 Received ${items.length} price items from N8N`);
    
    // Validate items
    const validItems = items.filter(item => 
      item.domain && item.product_name && item.price && item.currency
    );
    
    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid price items provided'
      });
    }
    
    console.log(`✅ Validated ${validItems.length} items, storing...`);
    
    // Store to memory for dashboard
    validItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.domain} - ${item.product_name}: ${item.price} ${item.currency}`);
      
      // Add to stored prices
      storedPrices.push({
        title: item.product_name,
        price: `${item.price} ${item.currency}`,
        currency: item.currency,
        region: item.region || 'TR',
        url: item.url,
        siteName: item.domain,
        gameSlug: 'unknown',
        scraped_at: item.batch_timestamp || new Date().toISOString()
      });
    });
    
    // Also update dashboard items
    dashboardItems = [...storedPrices];
    
    return res.json({
      success: true,
      message: 'Price items stored successfully',
      stored: validItems.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error storing price items:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get latest prices
app.get('/api/prices/latest', async (req, res) => {
  try {
    // This would need actual PostgreSQL connection
    // For now, return mock data
    res.json({
      success: true,
      data: [
        {
          id: 1,
          product_name: "PUBG Mobile 300 UC",
          price: 29.99,
          currency: "TRY",
          region: "TR",
          url: "https://example.com",
          scraped_at: new Date().toISOString()
        }
      ],
      total: 1
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get supported domains
app.get('/domains', async (req, res) => {
  try {
    const { SITE_CONFIGS } = await import('./scrapers/hybrid-scraper-factory');
    const domains = Object.keys(SITE_CONFIGS);
    
    res.json({
      domains,
      count: domains.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Rate limiting configuration endpoints
app.post('/config/rate-limit', (req, res) => {
  try {
    const { domainDelayMinutes, requestDelaySeconds, batchDelaySeconds } = req.body;
    
    // These would need to be applied to the orchestrator instance when it's created
    const config = {
      domainDelay: domainDelayMinutes || 30, // 30 minutes default
      requestDelay: requestDelaySeconds || 5, // 5 seconds default  
      batchDelay: batchDelaySeconds || 30 // 30 seconds default
    };
    
    res.json({
      success: true,
      message: 'Rate limit configuration updated',
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/config/rate-limit', (req, res) => {
  res.json({
    success: true,
    config: {
      domainDelay: '30 minutes (default)',
      requestDelay: '5 seconds (default)',
      batchDelay: '30 seconds (default)',
      concurrency: '1 (rate limited)',
      note: 'These are the current rate limiting settings to avoid being blocked'
    },
    timestamp: new Date().toISOString()
  });
});

// Store scraped items for dashboard
let dashboardItems: any[] = [];
let storedPrices: any[] = []; // N8N'den gelen price items

// Modern dashboard endpoint
app.get('/api/dashboard/items', (req, res) => {
  const { search, sortBy, sortOrder, minPrice, maxPrice } = req.query;
  
  let filteredItems = [...dashboardItems];
  
  // Search filter
  if (search) {
    const searchTerm = search.toString().toLowerCase();
    filteredItems = filteredItems.filter(item => 
      item.title.toLowerCase().includes(searchTerm) ||
      item.siteName.toLowerCase().includes(searchTerm)
    );
  }
  
  // Price filter
  if (minPrice || maxPrice) {
    filteredItems = filteredItems.filter(item => {
      const price = parseFloat(item.price.replace(/[^\d.,]/g, '').replace(',', '.'));
      if (minPrice && price < parseFloat(minPrice.toString())) return false;
      if (maxPrice && price > parseFloat(maxPrice.toString())) return false;
      return true;
    });
  }
  
  // Sort
  if (sortBy) {
    filteredItems.sort((a, b) => {
      let aVal, bVal;
      
      if (sortBy === 'price') {
        aVal = parseFloat(a.price.replace(/[^\d.,]/g, '').replace(',', '.'));
        bVal = parseFloat(b.price.replace(/[^\d.,]/g, '').replace(',', '.'));
      } else if (sortBy === 'title') {
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
      } else if (sortBy === 'siteName') {
        aVal = a.siteName.toLowerCase();
        bVal = b.siteName.toLowerCase();
      } else {
        return 0;
      }
      
      if (sortOrder === 'desc') {
        return bVal > aVal ? 1 : -1;
      } else {
        return aVal > bVal ? 1 : -1;
      }
    });
  }
  
  res.json({
    success: true,
    items: filteredItems,
    total: filteredItems.length,
    timestamp: new Date().toISOString()
  });
});

// Serve static files (dashboard served from public/index.html)

app.listen(port, () => {
  console.log(`✅ Backend up on http://localhost:${port}`);
  console.log(`🎯 N8N Webhook: ${n8nWebhookUrl}`);
  console.log(`🌐 Web Interface: http://localhost:${port}`);
});
