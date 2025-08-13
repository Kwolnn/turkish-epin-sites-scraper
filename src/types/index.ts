export interface ScrapedPrice {
  game_id?: number;
  site_id?: number;
  price: number;
  currency: string;
  region: string;
  product_name: string;
  url: string;
  batch_timestamp: Date;
}

export interface ScrapedItem {
  title: string;
  price: string;
  originalPrice?: string;
  currency: string;
  region: string;
  url: string;
  siteName: string;
  gameSlug?: string;
}

export interface SiteConfig {
  name: string;
  domain: string;
  selectors: {
    container: string;
    title: string;
    price: string;
    originalPrice?: string;
    currency?: string;
  };
  waitFor?: string;
  delay?: number;
  maxRetries?: number;
  requiresJS?: boolean;
}

export interface ScrapingResult {
  success: boolean;
  url: string;
  items: ScrapedItem[];
  error?: string;
  responseTime: number;
  siteName: string;
}

export interface BatchResult {
  batchId: string;
  timestamp: Date;
  totalUrls: number;
  successCount: number;
  failedCount: number;
  results: ScrapingResult[];
  totalItems: number;
  errors: string[];
}

export interface N8NWebhookPayload {
  batchId: string;
  timestamp: string;
  items: ScrapedPrice[];
  metadata: {
    totalUrls: number;
    successCount: number;
    failedCount: number;
    totalItems: number;
  };
}