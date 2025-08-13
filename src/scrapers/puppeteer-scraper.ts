import puppeteer, { Browser, Page } from 'puppeteer';
import { ScrapedItem, ScrapingResult, SiteConfig } from '../types';
import { 
  extractDomain, 
  extractGameSlug, 
  parsePrice, 
  detectRegion, 
  isValidPrice,
  sanitizeText 
} from '../utils/helpers';

export class PuppeteerScraper {
  private config: SiteConfig;
  private browser: Browser | null = null;

  constructor(config: SiteConfig) {
    this.config = config;
  }

  async scrapeUrl(url: string): Promise<ScrapingResult> {
    const startTime = Date.now();
    const domain = extractDomain(url);
    
    console.log(`🎭 Scraping ${url}...`);
    
    let page: Page | null = null;
    
    try {
      // Launch browser if not already launched  
      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--no-first-run',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--ignore-certificate-errors-spki-list'
          ],
          defaultViewport: { width: 1366, height: 768 },
          timeout: 30000
        });
      }

      page = await this.browser.newPage();
      
      // Set viewport and user agent - make it look more like a real browser
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
      
      // Set extra headers to mimic real browser
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
      });
      
      // Special handling for vatangame - allow all resources
      if (url.includes('vatangame.com')) {
        // Don't block anything for vatangame - needs CSS/images to load properly
      } else {
        // Disable images and stylesheets for other sites for faster loading
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          if(req.resourceType() == 'stylesheet' || req.resourceType() == 'image'){
            req.abort();
          } else {
            req.continue();
          }
        });
      }

      // Navigate to URL with better error handling
      try {
        if (url.includes('vatangame.com')) {
          // Vatangame needs full page load with extended timeout
          await page.goto(url, { 
            waitUntil: 'load',
            timeout: 30000
          });
        } else {
          await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 20000
          });
        }
      } catch (navigationError) {
        // Fallback navigation strategy
        console.log(`⚠️ Primary navigation failed for ${url}, trying fallback...`);
        await page.goto(url, { 
          waitUntil: 'domcontentloaded', 
          timeout: 15000
        });
      }
      
      // Special handling for vatangame.com
      if (url.includes('vatangame.com')) {
        // Wait longer for JavaScript to load content
        await page.waitForTimeout(8000);
        
        // Scroll to trigger any lazy loading
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(3000);
      }

      // Wait for page content to load
      if (this.config.waitFor) {
        try {
          await page.waitForSelector(this.config.waitFor, { timeout: 10000 });
        } catch (error) {
          console.log(`⚠️ Wait selector ${this.config.waitFor} not found in ${url}, continuing anyway...`);
          await page.waitForTimeout(3000);
        }
      } else {
        await page.waitForTimeout(3000);
      }
      
      // Extract items
      const items = await this.extractItems(page, url);

      await page.close();

      return {
        success: items.length > 0,
        url,
        items,
        error: items.length === 0 ? 'No items found with Puppeteer' : undefined,
        responseTime: Date.now() - startTime,
        siteName: domain
      };

    } catch (error) {
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          // Ignore close errors
        }
      }

      return {
        success: false,
        url,
        items: [],
        error: error instanceof Error ? error.message : 'Unknown Puppeteer error',
        responseTime: Date.now() - startTime,
        siteName: domain
      };
    }
  }

  private async extractItems(page: Page, url: string): Promise<ScrapedItem[]> {
    const domain = extractDomain(url);
    
    try {
      const items = await page.evaluate((config, url, domain) => {
        const results: any[] = [];
        
        // Helper functions (recreated in browser context)
        const sanitizeText = (text: string): string => {
          return text.replace(/\s+/g, ' ').trim().substring(0, 200);
        };

        const parsePrice = (priceText: string): { price: number; currency: string } => {
          const numericPrice = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(',', '.'));
          const currency = priceText.toLowerCase().includes('usd') ? 'USD' :
                          priceText.toLowerCase().includes('eur') ? 'EUR' : 'TRY';
          return { price: numericPrice, currency };
        };

        const isValidPrice = (price: number): boolean => {
          return !isNaN(price) && price > 0 && price < 1000000;
        };

        const detectRegion = (url: string, title: string): string => {
          if (url.includes('global') || title.toLowerCase().includes('global')) return 'Global';
          if (url.includes('eu') || url.includes('europe') || title.toLowerCase().includes('eu')) return 'EU';
          if (url.includes('na') || url.includes('america') || title.toLowerCase().includes('na')) return 'US';
          return 'TR';
        };

        const extractGameSlug = (url: string, title: string): string => {
          if (url.includes('pubg') || title.toLowerCase().includes('pubg')) return 'pubg';
          if (url.includes('lol') || url.includes('legends') || title.toLowerCase().includes('legends')) return 'lol';
          if (url.includes('valorant') || title.toLowerCase().includes('valorant')) return 'valorant';
          if (url.includes('mobile-legends') || title.toLowerCase().includes('mobile legends')) return 'mobile-legends';
          if (url.includes('fire') || title.toLowerCase().includes('fire')) return 'free-fire';
          return 'unknown';
        };

        // Try multiple container selectors
        const containerSelectors = config.selectors.container.split(', ');
        
        for (const containerSel of containerSelectors) {
          const containers = document.querySelectorAll(containerSel);
          
          if (containers.length === 0) continue;

          containers.forEach((container, index) => {
            if (index > 50) return; // Limit to first 50
            
            try {
              // Try configured selectors first
              let title = '';
              let priceText = '';
              
              const titleSelectors = config.selectors.title.split(', ');
              for (const titleSel of titleSelectors) {
                const titleEl = container.querySelector(titleSel);
                if (titleEl && titleEl.textContent && titleEl.textContent.trim()) {
                  title = titleEl.textContent.trim();
                  break;
                }
              }

              const priceSelectors = config.selectors.price.split(', ');
              for (const priceSel of priceSelectors) {
                const priceEl = container.querySelector(priceSel);
                if (priceEl && priceEl.textContent && priceEl.textContent.trim()) {
                  priceText = priceEl.textContent.trim();
                  break;
                }
              }

              // Fallback to text parsing if selectors don't work
              if (!title || !priceText) {
                const text = container.textContent || '';
                const priceMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(tl|₺|try|usd|eur)/i);
                
                if (priceMatch) {
                  priceText = priceMatch[0];
                  if (!title) {
                    title = text.split(priceMatch[0])[0].trim().substring(0, 100);
                  }
                }
              }

              if (title && priceText && title.length > 3) {
                const { price, currency } = parsePrice(priceText);
                
                if (isValidPrice(price)) {
                  results.push({
                    title: sanitizeText(title),
                    price: priceText,
                    currency,
                    region: detectRegion(url, title),
                    url,
                    siteName: domain,
                    gameSlug: extractGameSlug(url, title)
                  });
                }
              }
            } catch (error) {
              // Ignore individual item errors
            }
          });

          if (results.length > 0) break;
        }

        return results;
      }, this.config, url, domain);

      console.log(`✅ ${url} - ${items.length} items`);
      return items;

    } catch (error) {
      console.error(`❌ ${url} - FAILED`);
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}