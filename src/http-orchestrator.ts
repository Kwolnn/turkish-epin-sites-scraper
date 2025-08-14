import fs from 'fs/promises';
import { PuppeteerScraper } from './scrapers/puppeteer-scraper';
import { FlareSolverrScraper } from './scrapers/flaresolverr-scraper';
import { SITE_CONFIGS, FLARESOLVERR_REQUIRED_DOMAINS } from './scrapers/hybrid-scraper-factory';
import { N8NClient } from './utils/n8n-client';
import { BatchResult, ScrapingResult, SiteConfig } from './types';
import { generateBatchId, extractDomain } from './utils/helpers';

export class HttpOrchestrator {
  private n8nClient: N8NClient;
  private concurrency: number = Number(process.env.SCRAPER_CONCURRENCY) || 2; // Optimized for 1 hour completion
  private batchDelay: number = Number(process.env.SCRAPER_BATCH_DELAY) || 10000; // 10 seconds between batches
  private requestDelay: number = Number(process.env.SCRAPER_REQUEST_DELAY) || 3000; // 3 seconds between requests
  private domainLastRequest: Map<string, number> = new Map(); // Track last request per domain
  private domainDelay: number = Number(process.env.SCRAPER_DOMAIN_DELAY) || 0; // No domain delay - use batch timing instead
  private maxExecutionTime: number = Number(process.env.MAX_EXECUTION_TIME) || 3600000; // 1 hour max execution
  private startTime: number = 0;

  constructor(n8nWebhookUrl: string) {
    this.n8nClient = new N8NClient(n8nWebhookUrl);
  }

  async initialize(): Promise<void> {
    this.startTime = Date.now();
    console.log('🎭 Initializing Puppeteer scraping orchestrator...');
    console.log(`⚙️ Optimized for 1-hour completion:`);
    console.log(`   - Concurrency: ${this.concurrency} URLs simultaneously`);
    console.log(`   - Batch delay: ${this.batchDelay / 1000}s`);
    console.log(`   - Request delay: ${this.requestDelay / 1000}s`);
    console.log(`   - Max execution time: ${this.maxExecutionTime / 60000} minutes`);
    console.log(`   - Domain delay: ${this.domainDelay === 0 ? 'DISABLED (time-optimized)' : this.domainDelay / 60000 + 'm'}`);
    
    // Test N8N connection
    const n8nConnected = await this.n8nClient.testConnection();
    if (!n8nConnected) {
      console.warn('⚠️ N8N connection test failed, but continuing...');
    }

    console.log('✅ Puppeteer orchestrator initialized for time-boxed execution');
  }

  async scrapeUrls(urls: string[], progressCallback?: (processed: number, total: number) => void): Promise<BatchResult> {
    const batchId = generateBatchId();
    const timestamp = new Date();
    const results: ScrapingResult[] = [];
    
    console.log(`\n🎯 Starting direct scraping with ${urls.length} URLs (no batching)`);
    
    // Process URLs one by one for debugging
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\n🔍 [${i + 1}/${urls.length}] Processing: ${url}`);
      
      try {
        const result = await this.scrapeUrlHttp(url, i + 1, urls.length);
        results.push(result);
        
        if (progressCallback) {
          progressCallback(i + 1, urls.length);
        }
        
        // Small delay between requests for debugging
        if (i < urls.length - 1) {
          await this.sleep(1000); // 1 second delay
        }
        
      } catch (error) {
        console.error(`💥 Error processing ${url}:`, error);
        results.push({
          success: false,
          url,
          items: [],
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime: 0,
          siteName: extractDomain(url)
        });
      }
    }
    
    return this.createBatchResult(urls, results, batchId, timestamp);
  }

  private async scrapeUrlHttp(url: string, index: number, total: number): Promise<ScrapingResult> {
    const domain = extractDomain(url);
    console.log(`🌐 [${index}/${total}] HTTP scraping ${domain}...`);
  
     try {
      const config = SITE_CONFIGS[domain] || this.getGenericConfig(domain);
  
      // 🔀 Domain'e göre seçim
      if (FLARESOLVERR_REQUIRED_DOMAINS.has(domain)) {
        console.log(`🛡️ Using FLARESOLVERR scraper for ${domain}`);
        const scraper = new FlareSolverrScraper(config);
        const result = await scraper.scrapeUrl(url);
        const status = result.success ? '✅' : '❌';
        console.log(`   ${status} ${domain} - ${result.items.length} items (${Math.round(result.responseTime)}ms)`);
        if (!result.success && result.error) console.log(`      Error: ${result.error}`);
        return result;
      } else {
        console.log(`🎭 Using PUPPETEER scraper for ${domain}`);
        const scraper = new PuppeteerScraper(config);
        const result = await scraper.scrapeUrl(url);
        await scraper.close();
        const status = result.success ? '✅' : '❌';
        console.log(`   ${status} ${domain} - ${result.items.length} items (${Math.round(result.responseTime)}ms)`);
        if (!result.success && result.error) console.log(`      Error: ${result.error}`);
        return result;
      }
    } catch (error) {
      console.error(`   💥 ${domain} - Exception: ${error}`);
      return {
        success: false,
        url,
        items: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: 0,
        siteName: domain
      };
    }
  }

  private getGenericConfig(domain: string): SiteConfig {
    return {
      name: domain,
      domain,
      selectors: {
        container: '.product, .item, .card, .product-item, div, article, section, tr',
        title: '.title, .name, .product-title, .product-name, h1, h2, h3, h4, h5, [class*="product"], [class*="title"], [class*="name"]',
        price: '.price, .cost, .amount, .product-price, [class*="price"], [class*="fiyat"], [class*="cost"], span, div, td',
        originalPrice: '.old-price, .original-price, .was-price'
      },
      waitFor: undefined,
      delay: 1000,
      maxRetries: 3,
      requiresJS: false
    };
  }

  private createBatchResult(urls: string[], results: ScrapingResult[], batchId: string, timestamp: Date): BatchResult {
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;
    const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
    const errors = results.filter(r => !r.success).map(r => r.error || 'Unknown error');

    const batchResult: BatchResult = {
      batchId,
      timestamp,
      totalUrls: urls.length,
      successCount,
      failedCount,
      results,
      totalItems,
      errors
    };

    // Print summary
    this.printBatchSummary(batchResult);

    // Send to N8N
    if (batchResult.totalItems > 0) {
      console.log('\n📤 Sending data to N8N...');
      this.n8nClient.sendBatchData(batchResult).then(success => {
        if (!success) {
          console.error('❌ Failed to send data to N8N');
        }
      });
    } else {
      console.log('⚠️ No items scraped, skipping N8N submission');
    }

    return batchResult;
  }

  private printBatchSummary(batchResult: BatchResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 HTTP SCRAPING SUMMARY');
    console.log('='.repeat(60));
    console.log(`🆔 Batch ID: ${batchResult.batchId}`);
    console.log(`🕐 Timestamp: ${batchResult.timestamp.toISOString()}`);
    console.log(`🎯 Total URLs: ${batchResult.totalUrls}`);
    console.log(`✅ Successful: ${batchResult.successCount} (${Math.round(batchResult.successCount/batchResult.totalUrls*100)}%)`);
    console.log(`❌ Failed: ${batchResult.failedCount} (${Math.round(batchResult.failedCount/batchResult.totalUrls*100)}%)`);
    console.log(`📦 Total Items: ${batchResult.totalItems}`);
    
    if (batchResult.totalItems > 0) {
      const avgItemsPerUrl = Math.round(batchResult.totalItems / batchResult.successCount * 10) / 10;
      console.log(`📈 Avg Items/URL: ${avgItemsPerUrl}`);
    }

    // Show performance by domain
    const domainPerformance: { [domain: string]: { items: number; success: number; total: number } } = {};
    
    batchResult.results.forEach(result => {
      const domain = result.siteName;
      if (!domainPerformance[domain]) {
        domainPerformance[domain] = { items: 0, success: 0, total: 0 };
      }
      domainPerformance[domain].total++;
      domainPerformance[domain].items += result.items.length;
      if (result.success) domainPerformance[domain].success++;
    });

    console.log('\n🏆 Domain Performance:');
    Object.entries(domainPerformance)
      .sort((a, b) => b[1].items - a[1].items)
      .slice(0, 10)
      .forEach(([domain, stats]) => {
        const successRate = Math.round(stats.success / stats.total * 100);
        const icon = successRate > 80 ? '🟢' : successRate > 50 ? '🟡' : '🔴';
        console.log(`   ${icon} ${domain}: ${stats.items} items, ${successRate}% success (${stats.success}/${stats.total})`);
      });

    if (batchResult.errors.length > 0) {
      console.log('\n❌ Common Errors:');
      const errorCounts: { [error: string]: number } = {};
      batchResult.errors.forEach(error => {
        const shortError = error.substring(0, 50);
        errorCounts[shortError] = (errorCounts[shortError] || 0) + 1;
      });
      
      Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([error, count]) => {
          console.log(`   ${error} (${count}x)`);
        });
    }

    console.log('='.repeat(60));
  }

  async scrapeFromFile(filePath: string, progressCallback?: (processed: number, total: number) => void): Promise<BatchResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const urls = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.startsWith('http'));

      console.log(`📄 Loaded ${urls.length} URLs from ${filePath}`);
      
      return await this.scrapeUrls(urls, progressCallback);
      
    } catch (error) {
      console.error(`❌ Failed to read URLs from ${filePath}:`, error);
      throw error;
    }
  }

  private async waitForDomainRateLimit(domain: string): Promise<void> {
    // Minimal delay for debugging - just 500ms
    await this.sleep(500);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    console.log('🔒 HTTP orchestrator closed');
  }

  private getDomainStats(urls: string[]): { [domain: string]: number } {
    const stats: { [domain: string]: number } = {};
    
    urls.forEach(url => {
      const domain = extractDomain(url);
      stats[domain] = (stats[domain] || 0) + 1;
    });

    return stats;
  }

  setConcurrency(concurrency: number): void {
    this.concurrency = Math.max(1, Math.min(8, concurrency));
    console.log(`⚙️ Concurrency set to ${this.concurrency}`);
  }

  setBatchDelay(delay: number): void {
    this.batchDelay = Math.max(500, delay);
    console.log(`⚙️ Batch delay set to ${this.batchDelay}ms`);
  }

  setDomainDelay(delayMinutes: number): void {
    this.domainDelay = Math.max(1, delayMinutes) * 60000; // Convert to milliseconds
    console.log(`⚙️ Domain delay set to ${delayMinutes} minutes`);
  }

  setRequestDelay(delaySeconds: number): void {
    this.requestDelay = Math.max(0, delaySeconds) * 1000; // Convert to milliseconds
    console.log(`⚙️ Request delay set to ${delaySeconds} seconds`);
  }

  getDomainStatus(): { [domain: string]: { lastRequest: string | null, nextAvailable: string } } {
    const status: { [domain: string]: { lastRequest: string | null, nextAvailable: string } } = {};
    const now = Date.now();
    
    for (const [domain, lastRequest] of this.domainLastRequest.entries()) {
      const nextAvailable = new Date(lastRequest + this.domainDelay);
      status[domain] = {
        lastRequest: new Date(lastRequest).toLocaleString(),
        nextAvailable: nextAvailable > new Date(now) ? nextAvailable.toLocaleString() : 'Available now'
      };
    }
    
    return status;
  }
}