import UserAgent from 'user-agents';

export class UserAgentRotator {
  private agents: string[];
  private currentIndex: number = 0;

  constructor() {
    this.agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  getNext(): string {
    const agent = this.agents[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.agents.length;
    return agent;
  }

  getRandom(): string {
    return this.agents[Math.floor(Math.random() * this.agents.length)];
  }

  getRandomUserAgent(): string {
    const userAgent = new UserAgent();
    return userAgent.toString();
  }
}

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const randomDelay = (min: number = 1000, max: number = 3000): Promise<void> => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(delay);
};

export const extractDomain = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.replace('www.', '');
  } catch {
    return '';
  }
};

export const extractGameSlug = (url: string, title: string): string => {
  const gameKeywords = {
    'pubg': ['pubg', 'mobile', 'uc'],
    'mobile-legends': ['mobile', 'legends', 'mlbb', 'elmas'],
    'valorant': ['valorant', 'vp', 'points'],
    'lol': ['lol', 'league', 'legends', 'rp', 'riot'],
    'free-fire': ['free', 'fire', 'garena'],
    'genshin-impact': ['genshin', 'impact', 'genesis'],
    'honor-of-kings': ['honor', 'kings', 'jeton'],
    'roblox': ['roblox', 'robux'],
    'steam': ['steam', 'wallet', 'cuzdan'],
    'razer-gold': ['razer', 'gold']
  };

  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const combined = `${urlLower} ${titleLower}`;

  for (const [slug, keywords] of Object.entries(gameKeywords)) {
    if (keywords.some(keyword => combined.includes(keyword))) {
      return slug;
    }
  }

  return 'unknown';
};

export const parsePrice = (priceText: string): { price: number; currency: string } => {
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
};

export const detectRegion = (url: string, title: string): string => {
  const combined = `${url} ${title}`.toLowerCase();
  
  if (combined.includes('global') || combined.includes('worldwide')) return 'GLOBAL';
  if (combined.includes('eu') || combined.includes('europe') || combined.includes('west')) return 'EU';
  if (combined.includes('na') || combined.includes('north') || combined.includes('america') || combined.includes('usa') || combined.includes('us')) return 'US';
  if (combined.includes('tr') || combined.includes('turkey') || combined.includes('turkiye')) return 'TR';
  
  return 'TR'; // Default to Turkey
};

export const generateBatchId = (): string => {
  return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const isValidPrice = (price: number): boolean => {
  return price > 0 && price < 1000000 && !isNaN(price);
};

export const sanitizeText = (text: string): string => {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-_.₺$€]/g, '')
    .trim();
};