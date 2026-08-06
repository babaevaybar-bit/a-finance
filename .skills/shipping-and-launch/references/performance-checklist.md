# Performance Checklist

Pre-launch performance verification.

## Core Web Vitals
- [ ] LCP < 2.5s
- [ ] FID < 100ms
- [ ] CLS < 0.1

## Bundle
- [ ] JS bundle < 200KB (compressed)
- [ ] No unused code
- [ ] Code splitting configured
- [ ] Tree shaking enabled

## Images
- [ ] Optimized (WebP/AVIF)
- [ ] Responsive sizes
- [ ] Lazy loading
- [ ] Proper dimensions

## API
- [ ] No N+1 queries
- [ ] Proper indexes
- [ ] Pagination
- [ ] Caching headers

## CDN
- [ ] Static assets cached
- [ ] API responses cached
- [ ] Gzip/Brotli enabled