import axios, { AxiosResponse } from 'axios';
import { N8NWebhookPayload, ScrapedPrice, BatchResult } from '../types';

export class N8NClient {
  private webhookUrl: string;
  private timeout: number = 10000;
  private maxRetries: number = 1;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async sendBatchData(batchResult: BatchResult): Promise<boolean> {
    try {
      // Convert ScrapedItems to ScrapedPrices
      const prices: ScrapedPrice[] = [];
      
      batchResult.results.forEach(result => {
        if (result.success && result.items.length > 0) {
          result.items.forEach(item => {
            const { price, currency } = this.parsePrice(item.price);
            
            if (price > 0) {
              prices.push({
                price,
                currency,
                region: item.region,
                product_name: item.title,
                url: item.url,
                batch_timestamp: batchResult.timestamp
              });
            }
          });
        }
      });

      const payload: N8NWebhookPayload = {
        batchId: batchResult.batchId,
        timestamp: batchResult.timestamp.toISOString(),
        items: prices,
        metadata: {
          totalUrls: batchResult.totalUrls,
          successCount: batchResult.successCount,
          failedCount: batchResult.failedCount,
          totalItems: batchResult.totalItems
        }
      };

      console.log(`📤 Sending ${prices.length} items to N8N webhook...`);

      const success = await this.sendWithRetry(payload);
      
      if (success) {
        console.log(`✅ Successfully sent batch ${batchResult.batchId} to N8N`);
        return true;
      } else {
        console.error(`❌ Failed to send batch ${batchResult.batchId} to N8N after retries`);
        return false;
      }

    } catch (error) {
      console.error('Error preparing data for N8N:', error);
      return false;
    }
  }

  private async sendWithRetry(payload: N8NWebhookPayload): Promise<boolean> {
    try {
      const response: AxiosResponse = await axios.post(this.webhookUrl, payload, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GamePriceScraper/1.0'
        }
      });

      if (response.status >= 200 && response.status < 300) {
        console.log(`✅ N8N webhook success (${response.status})`);
        return true;
      } else {
        console.warn(`⚠️ N8N webhook responded with status ${response.status}`);
        return false;
      }

    } catch (error) {
      console.error(`❌ N8N webhook failed:`, 
        error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  private parsePrice(priceText: string): { price: number; currency: string } {
    if (!priceText) return { price: 0, currency: 'TRY' };

    // Remove whitespace and normalize
    const cleaned = priceText.replace(/\s+/g, ' ').trim();
    
    // Common currency patterns
    const patterns = [
      { regex: /(\d+(?:[.,]\d+)?)\s*₺/g, currency: 'TRY' },
      { regex: /₺\s*(\d+(?:[.,]\d+)?)/g, currency: 'TRY' },
      { regex: /(\d+(?:[.,]\d+)?)\s*TL/gi, currency: 'TRY' },
      { regex: /TL\s*(\d+(?:[.,]\d+)?)/gi, currency: 'TRY' },
      { regex: /(\d+(?:[.,]\d+)?)\s*\$/g, currency: 'USD' },
      { regex: /\$\s*(\d+(?:[.,]\d+)?)/g, currency: 'USD' },
      { regex: /(\d+(?:[.,]\d+)?)\s*€/g, currency: 'EUR' },
      { regex: /€\s*(\d+(?:[.,]\d+)?)/g, currency: 'EUR' },
      { regex: /(\d+(?:[.,]\d+)?)/g, currency: 'TRY' } // Default fallback
    ];

    for (const pattern of patterns) {
      const match = pattern.regex.exec(cleaned);
      if (match && match[1]) {
        const price = parseFloat(match[1].replace(',', '.'));
        return { price, currency: pattern.currency };
      }
    }

    return { price: 0, currency: 'TRY' };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testConnection(): Promise<boolean> {
    try {
      const testPayload: N8NWebhookPayload = {
        batchId: 'test_connection',
        timestamp: new Date().toISOString(),
        items: [],
        metadata: {
          totalUrls: 0,
          successCount: 0,
          failedCount: 0,
          totalItems: 0
        }
      };

      const response = await axios.post(this.webhookUrl, testPayload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GamePriceScraper/1.0'
        }
      });

      console.log(`✅ N8N connection test successful (${response.status})`);
      return true;

    } catch (error) {
      console.error('❌ N8N connection test failed:', 
        error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  setWebhookUrl(url: string): void {
    this.webhookUrl = url;
  }

  getWebhookUrl(): string {
    return this.webhookUrl;
  }
}