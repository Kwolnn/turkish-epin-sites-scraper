import axios from 'axios';
import { ScrapedItem, ScrapingResult, SiteConfig } from '../types';
import {
  extractDomain,
  extractGameSlug,
  parsePrice,
  isValidPrice,
  sanitizeText
} from '../utils/helpers';
import * as cheerio from 'cheerio';

export class FlareSolverrScraper {
  private config: SiteConfig;
  private flaresolverrUrl: string;
  private userAgent: string;

  constructor(config: SiteConfig) {
    this.config = config;
    this.flaresolverrUrl = process.env.FLARESOLVERR_URL || 'http://flaresolverr:8191';
    this.userAgent =
      process.env.USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  async scrapeUrl(url: string): Promise<ScrapingResult> {
    const startTime = Date.now();
    const domain = extractDomain(url);

    console.log(`🛡️ Using FlareSolverr for ${url} ...`);

    try {
      const sessionId = `session_${domain || 'default'}`;

      // Session oluşturmayı dene (varsa hata yutulur)
      try {
        await axios.post(
          `${this.flaresolverrUrl}/v1`,
          { cmd: 'sessions.create', session: sessionId },
          { timeout: 30000 }
        );
      } catch {
        console.log(`🛡️ Session ${sessionId} already exists or not needed, continuing...`);
      }

      // GET isteği (zorlu CF için geniş timeout)
      const flareResponse = await axios.post(
        `${this.flaresolverrUrl}/v1`,
        {
          cmd: 'request.get',
          url,
          session: sessionId,
          maxTimeout: 180000,
          userAgent: this.userAgent
        },
        {
          timeout: 190000,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (flareResponse.data.status !== 'ok') {
        throw new Error(`FlareSolverr error: ${flareResponse.data.message}`);
      }

      const html = flareResponse.data.solution.response as string;
      const $ = cheerio.load(html);

      const items: ScrapedItem[] = [];
      $(this.config.selectors.container).each((_, el) => {
        try {
          const $item = $(el);

          // Title
          let title = '';
          for (const sel of this.config.selectors.title.split(',').map(s => s.trim())) {
            const t = $item.find(sel).first();
            if (t && t.text().trim()) {
              title = t.text().trim();
              break;
            }
          }
          if (!title) {
            // attribute fallback
            const anyTitle =
              $item.attr('title') || $item.attr('alt') || $item.attr('data-title') || '';
            title = anyTitle.toString().trim();
          }

          // Price
          let priceText = '';
          for (const sel of this.config.selectors.price.split(',').map(s => s.trim())) {
            const p = $item.find(sel).first();
            if (p && p.text().trim()) {
              priceText = p.text().trim();
              break;
            }
          }
          if (!title || !priceText) return;

          // Parse price
          const priceResult = parsePrice(priceText);
          if (!isValidPrice(priceResult.price)) return;

          items.push({
            title: sanitizeText(title),
            price: priceText,
            currency: priceResult.currency,
            url,
            siteName: domain,
            gameSlug: extractGameSlug(url, title),
            region: 'TR'
          });
        } catch (e) {
          console.warn(`⚠️ Parse error on ${domain}:`, e);
        }
      });

      const ms = Date.now() - startTime;
      console.log(`🛡️ FlareSolverr scraped ${items.length} items from ${domain} (${ms}ms)`);

      return {
        url,
        success: true,
        items,
        responseTime: ms,
        siteName: domain,
        error: null
      };
    } catch (err) {
      const ms = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`❌ FlareSolverr scraping failed for ${domain}: ${msg}`);

      return {
        url,
        success: false,
        items: [],
        responseTime: ms,
        siteName: domain,
        error: msg
      };
    }
  }
}