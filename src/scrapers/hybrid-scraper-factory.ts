import { ScrapingResult, SiteConfig } from '../types';
import { extractDomain } from '../utils/helpers';

// Domains that require FlareSolverr for Cloudflare bypass
const FLARESOLVERR_REQUIRED_DOMAINS = new Set([
  'oyuneks.com', 'liderepin.com'  // Only these domains use FlareSolverr
]);

// Domains that work well with Puppeteer
const PUPPETEER_REQUIRED_DOMAINS = new Set([
  'epindigital.com', 'turkpin.com', 'oyunone.com', 'playsultan.com', 'epinsultan.com',
  'foxepin.com', 'perdigital.com', 'kopazar.com', 'vatangame.com', 'mtcgame.com',
  'bursagb.com', 'itemsatis.com', 'dijipin.com', 'oyunfor.com',
  'inovapin.com', 'bynogame.com', 'gamesatis.com', 'hesap.com.tr', 's2gepin.com',
  'hi2games.com'
]);

// No more axios-friendly domains - everything uses Puppeteer or FlareSolverr
const AXIOS_FRIENDLY_DOMAINS = new Set();

// Site configurations for different domains with exact selectors
const SITE_CONFIGS: { [domain: string]: SiteConfig } = {
  'epindigital.com': {
    name: 'EpinDigital',
    domain: 'epindigital.com',
    selectors: {
      container: 'div.product-item',
      title: 'h3.product-name.d-block',
      price: 'div.product-price, div.sales-price.fw-600.fs-18',
      originalPrice: '.old-price'
    },
    waitFor: 'h3.product-name',
    delay: 1000,
    maxRetries: 2,
    requiresJS: true
  },
  'turkpin.com': {
    name: 'TurkPin',
    domain: 'turkpin.com',
    selectors: {
      container: 'tr',
      title: 'h5, div.product__description, div.short_desc',
      price: 'td.bold',
      originalPrice: '.old-price'
    },
    waitFor: 'h5',
    delay: 1000,
    maxRetries: 2,
    requiresJS: true
  },
  'oyunone.com': {
    name: 'OyunOne',
    domain: 'oyunone.com',
    selectors: {
      container: 'div.item',
      title: 'div.text1',
      price: 'div.price notranslate, div.new_price.ng-binding',
      originalPrice: '.old-price'
    },
    waitFor: 'div.text1',
    delay: 1000,
    maxRetries: 2,
    requiresJS: true
  },
  'playsultan.com': {
    name: 'PlaySultan',
    domain: 'playsultan.com',
    selectors: {
      container: 'a div.product_item, div.product_item',
      title: 'h5',
      price: 'span.fiyat',
      originalPrice: '.old-price'
    },
    waitFor: 'div.product_item',
    delay: 1000,
    maxRetries: 2,
    requiresJS: true
  },
  'epinsultan.com': {
    name: 'EpinSultan',
    domain: 'epinsultan.com',
    selectors: {
      container: 'a div.product_item, div.product_item',
      title: 'h5',
      price: 'span.fiyat',
      originalPrice: '.old-price'
    },
    waitFor: 'div.product_item',
    delay: 1000,
    maxRetries: 2,
    requiresJS: true
  },
  'foxepin.com': {
    name: 'FoxEpin',
    domain: 'foxepin.com',
    selectors: {
      container: '.product-item, .product-card',
      title: 'h3.product-name.d-block',
      price: 'div.product-price',
      originalPrice: '.old-price'
    },
    waitFor: 'h3.product-name',
    delay: 1000,
    maxRetries: 2,
    requiresJS: true
  },
  'perdigital.com': {
    name: 'PerDigital',
    domain: 'perdigital.com',
    selectors: {
      container: 'tr, .product-row, .product',
      title: 'td.text-center, .product-name, .title',
      price: 'span.text-center.semi-bold, .price, .fiyat',
      originalPrice: '.old-price'
    },
    waitFor: 'tr',
    delay: 1500,
    maxRetries: 3,
    requiresJS: true
  },
  'kopazar.com': {
    name: 'Kopazar',
    domain: 'kopazar.com',
    selectors: {
      container: 'div.col-12 div.card div.list-items',
      title: 'a strong',
      price: 'div.d-flex.align-items-center.justify-content-end strong',
      originalPrice: '.old-price'
    },
    waitFor: 'div.card',
    delay: 1500,
    maxRetries: 2,
    requiresJS: true
  },
  'vatangame.com': {
    name: 'VatanGame',
    domain: 'vatangame.com',
    selectors: {
      container: '.card, div.card, [class*="card"], div.row, .row, [class*="row"], div.col, .product, .item',
      title: 'p, span, div, h1, h2, h3, h4, h5, a, strong, [class*="font-bold"], [class*="title"]',
      price: 'p, span, div, strong, [class*="font-bold"], [class*="price"], [class*="fiyat"], [style*="font-size"]',
      originalPrice: '[style*="line-through"], .old-price, [class*="old"]'
    },
    waitFor: 'body',
    delay: 5000,
    maxRetries: 5,
    requiresJS: true
  },
  'mtcgame.com': {
    name: 'MTCGame',
    domain: 'mtcgame.com',
    selectors: {
      container: 'a.border-2.border-amber-600\\/10',
      title: 'h3.text-white.font-medium.text-sm.line-clamp-2',
      price: 'div.text-right.bg-\\[\\#7CFF6B33\\] p.text-sm.font-medium.text-white',
      originalPrice: '.old-price'
    },
    waitFor: 'a.border-2.border-amber-600\\/10',
    delay: 1000,
    maxRetries: 2,
    requiresJS: true
  },
  'bursagb.com': {
    name: 'BursaGB',
    domain: 'bursagb.com',
    selectors: {
      container: '.product-item, .product-card, tr, .product',
      title: 'h3.product-name.d-block, h3.product-name, .title',
      price: 'div.product-price, .price, .fiyat',
      originalPrice: '.old-price'
    },
    waitFor: '.product-item',
    delay: 1500,
    maxRetries: 3,
    requiresJS: true
  },
  'liderepin.com': {
    name: 'LiderEpin',
    domain: 'liderepin.com',
    selectors: {
      container: '.product-item, .product, tr',
      title: 'h3.product-name.d-block, h3.product-name, .title',
      price: 'div.product-price, .price, .fiyat',
      originalPrice: '.old-price'
    },
    waitFor: '.product-item',
    delay: 1500,
    maxRetries: 3,
    requiresJS: true
  },
  'oyuneks.com': {
    name: 'OyunEks',
    domain: 'oyuneks.com',
    selectors: {
      container: 'button.productListHorizontal.detailProductButton, .productListHorizontal',
      title: 'div.productListHorizontalDetailTitle, .productListHorizontalDetailTitle',
      price: 'div.productListHorizontalDetailPrice, .productListHorizontalDetailPrice',
      originalPrice: '.old-price'
    },
    waitFor: '.productListHorizontal',
    delay: 3000,
    maxRetries: 3,
    requiresJS: true
  },
  'dijipin.com': {
    name: 'DijiPin',
    domain: 'dijipin.com',
    selectors: {
      container: '.product-item, .product, tr',
      title: 'h3.product-name.d-block, h3.product-name, .title',
      price: 'div.sales-price.fw-600.fs-18, .sales-price, .price, .fiyat',
      originalPrice: '.old-price'
    },
    waitFor: '.product-item',
    delay: 1500,
    maxRetries: 3,
    requiresJS: true
  },
  'itemsatis.com': {
    name: 'ItemSatis',
    domain: 'itemsatis.com',
    selectors: {
      container: 'div.relative.border.rounded-lg',
      title: 'h3.text-base.font-medium.\\!text-white',
      price: 'div.text-2xl.font-medium.text-\\[\\#ffd679\\]',
      originalPrice: 'div.text-base.line-through.text-gray-400'
    },
    waitFor: 'div.relative.border.rounded-lg',
    delay: 1000,
    maxRetries: 2,
    requiresJS: true
  },
  'inovapin.com': {
    name: 'InovaPin',
    domain: 'inovapin.com',
    selectors: {
      container: 'div.col-lg-6.col-md-6.col-xs-12.col-12.product-base',
      title: 'h3.product-name.d-block, h3.product-name, .title',
      price: 'div.sales-price.fw-600.fs-18',
      originalPrice: '.old-price'
    },
    waitFor: 'div.col-lg-6.col-md-6.col-xs-12.col-12.product-base',
    delay: 1500,
    maxRetries: 3,
    requiresJS: true
  },
  'bynogame.com': {
    name: 'BynoGame',
    domain: 'bynogame.com',
    selectors: {
      container: 'div.itemCard',
      title: 'h2.font-weight-bolder.text-left',
      price: 'div.col-lg-4.col-md-5',
      originalPrice: '.old-price'
    },
    waitFor: 'div.itemCard',
    delay: 1500,
    maxRetries: 2,
    requiresJS: true
  },
  'gamesatis.com': {
    name: 'GameSatis',
    domain: 'gamesatis.com',
    selectors: {
      container: 'a.product',
      title: 'h3',
      price: 'div.selling-price',
      originalPrice: 'div.original-price'
    },
    waitFor: 'a.product',
    delay: 1500,
    maxRetries: 3,
    requiresJS: true
  },
  'hesap.com.tr': {
    name: 'HesapComTr',
    domain: 'hesap.com.tr',
    selectors: {
      container: 'li.col-12.prd',
      title: 'a.d-flex',
      price: 'div#newprice_lg282.new',
      originalPrice: '.old-price'
    },
    waitFor: 'li.col-12.prd',
    delay: 1500,
    maxRetries: 2,
    requiresJS: true
  },
  's2gepin.com': {
    name: 'S2GEpin',
    domain: 's2gepin.com',
    selectors: {
      container: '.product-item, .product, tr',
      title: 'h3.product-name.d-block, h3.product-name, .title',
      price: 'div.product-price, .price, .fiyat',
      originalPrice: '.old-price'
    },
    waitFor: '.product-item',
    delay: 1500,
    maxRetries: 3,
    requiresJS: true
  },
  'hi2games.com': {
    name: 'Hi2Games',
    domain: 'hi2games.com',
    selectors: {
      container: 'div.table-container.product',
      title: 'div.table-item.name p.text-header:first-child',
      price: 'div.table-item.price p.text-header.current',
      originalPrice: 'div.table-item.price p.text-header.old'
    },
    waitFor: 'div.table-container.product',
    delay: 1500,
    maxRetries: 2,
    requiresJS: true
  },
  'oyunfor.com': {
    name: 'OyunFor',
    domain: 'oyunfor.com',
    selectors: {
      container: '.product-item, .productBox, tr, .product',
      title: 'h3.productText, h3, .title, .product-name',
      price: 'div.notranslate, .price, .fiyat',
      originalPrice: '.old-price'
    },
    waitFor: '.productBox',
    delay: 1500,
    maxRetries: 3,
    requiresJS: true
  }
};


export { FLARESOLVERR_REQUIRED_DOMAINS, PUPPETEER_REQUIRED_DOMAINS, AXIOS_FRIENDLY_DOMAINS, SITE_CONFIGS };