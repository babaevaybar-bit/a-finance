# Security Checklist

Pre-launch security verification.

## Authentication
- [ ] Passwords properly hashed (bcrypt/argon2)
- [ ] JWT secrets rotated regularly
- [ ] Session management secure
- [ ] OAuth flows validated

## Authorization
- [ ] Role-based access control implemented
- [ ] Permission checks on all endpoints
- [ ] IDOR vulnerabilities fixed

## Input Validation
- [ ] All inputs validated
- [ ] SQL injection prevented
- [ ] XSS prevented (output encoding)
- [ ] CSRF tokens in place

## Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] HTTPS everywhere
- [ ] API keys in environment variables
- [ ] No secrets in code

## Headers
- [ ] CSP configured
- [ ] HSTS enabled
- [ ] X-Frame-Options set
- [ ] Content-Type-Options set

## Dependencies
- [ ] `npm audit` clean
- [ ] Known vulnerabilities checked
- [ ] Outdated packages updated