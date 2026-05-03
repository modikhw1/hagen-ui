# Security Best Practices

This document outlines security measures implemented in this application.

## 🔒 Implemented Security Features

### 1. Environment Variables Protection
- All secrets stored in `.env.local` (gitignored)
- Never commit API keys to repository
- Use environment variables for all sensitive data

### 2. API Route Security

#### Input Validation
- All API routes use Zod schema validation
- Maximum length limits on all text inputs:
  - Text analysis: 10,000 characters
  - Chat messages: 5,000 characters per message
  - Profile names: 100 characters
  - URLs: 500 characters
- UUID validation to prevent SQL injection

#### XSS Protection
- Script tag removal from user inputs
- Content sanitization before processing

#### Error Handling
- Generic error messages to users (no internal details exposed)
- Detailed errors logged server-side only
- Proper HTTP status codes

### 3. Database Security

#### Row Level Security (RLS)
- Enabled on all tables
- Users can only access their own data
- Policies enforced at database level

#### Authentication
- Supabase handles auth securely
- JWT tokens for session management
- Service role key kept secret (server-side only)

### 4. Rate Limiting (Recommended to Add)

Consider adding rate limiting for production:
```bash
npm install @upstash/ratelimit @upstash/redis
```

## ⚠️ Before Going to Production

### 1. Rotate API Keys
If you've ever exposed your API keys publicly:
- OpenAI: https://platform.openai.com/api-keys
- Supabase: Project Settings → API

### 2. Add Rate Limiting
Protect against abuse with rate limits on API routes.

### 3. Add CORS Configuration
Configure allowed origins in production.

### 4. Set Up Monitoring
- Enable Vercel Analytics
- Set up error tracking (Sentry, LogRocket, etc.)
- Monitor API usage costs

### 5. Add Authentication
Protect API routes with authentication:
```typescript
// Example middleware
import { getCurrentUser } from '@/lib/supabase/auth'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  // ... rest of handler
}
```

### 6. Enable Security Headers
Already configured in `next.config.js`:
- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

### 7. HTTPS Only
- Vercel provides HTTPS by default
- Never disable HTTPS in production

## 🔍 Security Checklist

Before deploying:
- [ ] `.env.local` is in `.gitignore`
- [ ] No API keys in code
- [ ] All environment variables set in Vercel
- [ ] Input validation on all endpoints
- [ ] Rate limiting configured
- [ ] Error messages don't leak info
- [ ] HTTPS enabled
- [ ] Security headers configured
- [ ] Database RLS policies set
- [ ] Authentication implemented
- [ ] CORS configured properly

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
- [Supabase Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Vercel Security](https://vercel.com/docs/security)
