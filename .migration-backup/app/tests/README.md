# Tests

This folder contains E2E tests using Playwright.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp tests/.env.example tests/.env.local
   ```

3. Fill in your Supabase credentials in `tests/.env.local`

4. Install Playwright browsers:
   ```bash
   npx playwright install chromium
   ```

## Running Tests

```bash
# Run all tests
npm test

# Run with UI (interactive)
npm run test:ui

# Run with visible browser
npm run test:headed

# View test report
npm run test:report
```

## Test Structure

```
tests/
├── fixtures.ts          # Test fixtures and helpers
├── auth/
│   ├── login.spec.ts    # Login flow tests
│   ├── register.spec.ts # Registration tests
│   └── callback.spec.ts # Auth callback tests
└── .env.example        # Environment template
```

## Notes

- Tests automatically start the dev server on localhost:3000
- Use environment variables for test credentials to avoid committing secrets
- Tests are designed to work with a real Supabase instance
- For CI, set `CI=true` environment variable
