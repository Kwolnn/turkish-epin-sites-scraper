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

// Simple frontend for testing
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>🎮 Game Price Scraper</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .container { background: #f5f5f5; padding: 20px; border-radius: 10px; }
            button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 5px; }
            button:hover { background: #0056b3; }
            .status { margin: 20px 0; padding: 10px; border-radius: 5px; }
            .success { background: #d4edda; color: #155724; }
            .error { background: #f8d7da; color: #721c24; }
            .info { background: #d1ecf1; color: #0c5460; }
            .progress { background: #fff3cd; color: #856404; }
            .progress-bar { 
                width: 100%; 
                height: 20px; 
                background: #e9ecef; 
                border-radius: 10px; 
                overflow: hidden; 
                margin: 10px 0;
            }
            .progress-fill { 
                height: 100%; 
                background: linear-gradient(45deg, #007bff, #0056b3); 
                transition: width 0.3s ease;
                border-radius: 10px;
            }
            .loading { 
                display: inline-block; 
                animation: spin 1s linear infinite; 
            }
            @keyframes spin { 
                0% { transform: rotate(0deg); } 
                100% { transform: rotate(360deg); } 
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎮 Game Price Scraper</h1>
            <p>Oyun parası fiyatlarını otomatik olarak tarayan sistem</p>
            
            <div>
                <button onclick="startScraping()">🚀 Start Scraping</button>
                <button onclick="testN8N()">🔗 Test N8N</button>
                <button onclick="checkStatus()">📊 Check Status</button>
                <button onclick="getDomains()">🌐 Get Domains</button>
                <button onclick="getLatestPrices()">💰 Latest Prices</button>
                <button onclick="getFailedUrls()">❌ Failed URLs</button>
                <button onclick="getLastResult()">📋 Last Result</button>
            </div>
            
            <div id="status"></div>
            <div id="results"></div>
        </div>

        <script>
            let progressInterval = null;

            function showStatus(message, type = 'info') {
                const statusDiv = document.getElementById('status');
                statusDiv.innerHTML = \`<div class="status \${type}">\${message}</div>\`;
            }

            function showProgress(percentage, message) {
                const statusDiv = document.getElementById('status');
                statusDiv.innerHTML = \`
                    <div class="status progress">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="loading">⟳</span>
                            <span>\${message}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: \${percentage}%"></div>
                        </div>
                        <div style="text-align: center; font-size: 12px;">\${percentage}%</div>
                    </div>
                \`;
            }

            function showResults(data) {
                const resultsDiv = document.getElementById('results');
                resultsDiv.innerHTML = \`<pre>\${JSON.stringify(data, null, 2)}</pre>\`;
            }

            function startProgressMonitoring() {
                if (progressInterval) clearInterval(progressInterval);
                progressInterval = setInterval(async () => {
                    try {
                        const response = await fetch('/scrape/status');
                        const data = await response.json();
                        
                        if (data.isRunning) {
                            const progress = data.progressPercentage || data.progress || 0;
                            const processed = data.processedUrls || 0;
                            const total = data.totalUrls || 0;
                            
                            if (total > 0) {
                                showProgress(progress, \`Scraping URLs: \${processed}/\${total}\`);
                            } else {
                                showProgress(progress, 'Initializing scraper...');
                            }
                        } else {
                            clearInterval(progressInterval);
                            progressInterval = null;
                            
                            if (data.progress === 100) {
                                showStatus(\`✅ Scraping completed! \${data.totalItems || 0} items scraped\`, 'success');
                            } else if (data.progress === -1) {
                                showStatus('❌ Scraping failed', 'error');
                            }
                        }
                    } catch (error) {
                        console.error('Progress monitoring error:', error);
                    }
                }, 1000);
            }

            async function startScraping() {
                showStatus('🚀 Starting scraping job...', 'info');
                try {
                    const response = await fetch('/scrape/start', { 
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const data = await response.json();
                    
                    if (data.success) {
                        if (data.isRunning) {
                            // Already running - show current progress
                            const progress = data.progress || 0;
                            showProgress(progress, data.message);
                            startProgressMonitoring();
                        } else {
                            // Just started - begin monitoring
                            showStatus('✅ ' + data.message, 'success');
                            startProgressMonitoring();
                        }
                    } else {
                        showStatus(\`❌ Scraping failed: \${data.error}\`, 'error');
                    }
                    showResults(data);
                } catch (error) {
                    showStatus(\`❌ Error: \${error.message}\`, 'error');
                }
            }

            async function testN8N() {
                showStatus('🔗 Testing N8N connection...', 'info');
                try {
                    const response = await fetch('/test/n8n');
                    const data = await response.json();
                    
                    if (data.success) {
                        showStatus('✅ N8N connection successful!', 'success');
                    } else {
                        showStatus(\`❌ N8N connection failed: \${data.error}\`, 'error');
                    }
                    showResults(data);
                } catch (error) {
                    showStatus(\`❌ Error: \${error.message}\`, 'error');
                }
            }

            async function checkStatus() {
                showStatus('📊 Checking status...', 'info');
                try {
                    const response = await fetch('/scrape/status');
                    const data = await response.json();
                    showStatus('✅ Status retrieved!', 'success');
                    showResults(data);
                } catch (error) {
                    showStatus(\`❌ Error: \${error.message}\`, 'error');
                }
            }

            async function getDomains() {
                showStatus('🌐 Getting supported domains...', 'info');
                try {
                    const response = await fetch('/domains');
                    const data = await response.json();
                    showStatus(\`✅ Found \${data.count} supported domains!\`, 'success');
                    showResults(data);
                } catch (error) {
                    showStatus(\`❌ Error: \${error.message}\`, 'error');
                }
            }

            async function getLatestPrices() {
                showStatus('💰 Getting latest prices...', 'info');
                try {
                    const response = await fetch('/api/prices/latest');
                    const data = await response.json();
                    showStatus('✅ Found ' + data.total + ' price records!', 'success');
                    showResults(data);
                } catch (error) {
                    showStatus('❌ Error: ' + error.message, 'error');
                }
            }

            async function getFailedUrls() {
                showStatus('❌ Getting failed URLs...', 'info');
                try {
                    const response = await fetch('/scrape/failed-urls');
                    const data = await response.json();
                    if (data.count > 0) {
                        showStatus('❌ Found ' + data.count + ' failed URLs', 'error');
                    } else {
                        showStatus('✅ No failed URLs in last scraping job', 'success');
                    }
                    showResults(data);
                } catch (error) {
                    showStatus('❌ Error: ' + error.message, 'error');
                }
            }

            async function getLastResult() {
                showStatus('📋 Getting last batch result...', 'info');
                try {
                    const response = await fetch('/scrape/last-result');
                    const data = await response.json();
                    if (data.success) {
                        const result = data.result;
                        showStatus('📋 Last batch: ' + result.batchId + ' (' + result.totalItems + ' items)', 'success');
                    } else {
                        showStatus('📋 No batch results available', 'info');
                    }
                    showResults(data);
                } catch (error) {
                    showStatus('❌ Error: ' + error.message, 'error');
                }
            }
        </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`✅ Backend up on http://localhost:${port}`);
  console.log(`🎯 N8N Webhook: ${n8nWebhookUrl}`);
  console.log(`🌐 Web Interface: http://localhost:${port}`);
});
