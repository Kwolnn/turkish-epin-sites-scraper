# 🎮 Game Price Scraping System

A comprehensive game price scraping and monitoring system with N8N workflow automation, built with Docker, Node.js, and PostgreSQL.

## 🚀 Features

- **Hybrid Web Scraping**: Puppeteer + FlareSolverr for bypassing protection
- **N8N Workflow Integration**: Automated scraping with resume URL support
- **Real-time Dashboard**: Modern glassmorphism UI with filtering and sorting
- **PostgreSQL Storage**: Persistent price data with encryption support
- **Docker Orchestration**: Fully containerized microservices architecture
- **Anti-Bot Protection**: Rate limiting and domain-specific delays
- **Cache Management**: Optimized frontend with cache-busting

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   PostgreSQL    │
│  (Dashboard)    │◄──►│  (Express.js)   │◄──►│   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│      N8N        │◄──►│ FlareSolverr    │    │  Scraping       │
│  (Automation)   │    │ (CF Bypass)     │    │  Orchestrator   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Services

| Service | Port | Description |
|---------|------|-------------|
| Backend | 3000 | Main API server and web interface |
| N8N | 5678 | Workflow automation platform |
| PostgreSQL | 5432 | Database for storing scraped data |
| FlareSolverr | 8191 | Cloudflare bypass proxy |

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for development)
- Ngrok account (for N8N webhooks)

### 1. Clone Repository
```bash
git clone <repository-url>
cd scrape_project
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your configurations
```

**Required Environment Variables:**
```env
# N8N Configuration
N8N_BASIC_AUTH_USER=your_email@example.com
N8N_BASIC_AUTH_PASSWORD=your_password
N8N_RESUME_URL=https://your-ngrok-url.ngrok-free.app/webhook-waiting/174

# Database
DB_PASSWORD=your_db_password

# Ngrok URL (update in docker-compose.yml)
N8N_HOST=your-ngrok-url.ngrok-free.app
WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app
```

### 3. Start Services
```bash
docker-compose up -d --build
```

### 4. Access Applications
- **Frontend Dashboard**: http://localhost:3000
- **N8N Interface**: http://localhost:5678
- **Database**: localhost:5432

## 🔧 API Endpoints

### Scraping
- `POST /scrape/sync` - Synchronous scraping for N8N
- `POST /scrape/start` - Asynchronous scraping with progress tracking
- `GET /scrape/status` - Get current scraping status

### Dashboard
- `GET /api/dashboard/items` - Get filtered dashboard items
- `POST /api/prices/store` - Store price data from N8N

### Utilities
- `GET /health` - Health check
- `GET /domains` - Get supported domains
- `GET /test/n8n` - Test N8N connection

## 🎯 N8N Workflow Integration

1. **Workflow Trigger**: N8N starts scraping job
2. **Resume URL Creation**: Workflow pauses at wait node
3. **Backend Scraping**: System scrapes URLs using hybrid approach
4. **Data Transmission**: Results sent to N8N resume URL
5. **Workflow Continuation**: N8N processes and stores data
6. **Dashboard Update**: Frontend displays real-time results

### Sample N8N Workflow Structure
```
HTTP Request (Start) → Wait Node → HTTP Request (Resume) → PostgreSQL Store
```

## 🛠️ Development

### Local Development
```bash
npm install
npm run dev
```

### Build for Production
```bash
npm run build
```

### Run Tests
```bash
npm test
```

## 📊 Frontend Features

- **Row-based Layout**: Clean, scannable item display
- **Real-time Updates**: 30-second auto-refresh
- **Advanced Filtering**: Search, price range, sorting
- **Responsive Design**: Mobile-optimized interface
- **Cache Management**: Automatic cache invalidation

## 🔒 Security Features

- **Rate Limiting**: Domain-specific delays to avoid blocking
- **Credential Encryption**: N8N credentials encrypted at rest
- **Environment Variables**: Sensitive data externalized
- **Container Isolation**: Each service runs in isolated container

## 🐛 Troubleshooting

### Common Issues

**N8N Authentication Error:**
```bash
# Check N8N encryption key
docker exec n8n_app env | grep N8N_ENCRYPTION_KEY
```

**PostgreSQL Connection Failed:**
```bash
# Check database status
docker exec postgres_db pg_isready -U postgres
```

**Frontend Cache Issues:**
- Hard refresh: `Ctrl+Shift+R`
- Clear browser cache
- Disable cache in DevTools

**FlareSolverr Timeout:**
```bash
# Restart FlareSolverr service
docker-compose restart flaresolverr
```

## 📝 Configuration

### Scraping Settings
```env
SCRAPER_CONCURRENCY=2          # Simultaneous requests
SCRAPER_BATCH_DELAY=10000      # Delay between batches (ms)
SCRAPER_REQUEST_DELAY=3000     # Delay between requests (ms)
SCRAPER_DOMAIN_DELAY=0         # Domain-specific delay (ms)
MAX_EXECUTION_TIME=3600000     # 1 hour max execution
```

### Rate Limiting
- Optimized for 1-hour completion
- Domain-specific delays disabled for speed
- Batch processing with smart delays

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Submit pull request

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- [N8N Documentation](https://docs.n8n.io/)
- [FlareSolverr GitHub](https://github.com/FlareSolverr/FlareSolverr)
- [Puppeteer Docs](https://pptr.dev/)
- [Docker Compose Guide](https://docs.docker.com/compose/)

---

**⚠️ Disclaimer**: This tool is for educational purposes only. Always respect robots.txt and website terms of service when scraping.