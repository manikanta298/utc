# API Connection Troubleshooting Guide

## Issue: `net::ERR_FAILED` or CORS errors on login

These errors usually mean the browser could not complete the request before the login route ran.

### 1. CORS origin mismatch

The frontend origin must match the backend CORS allowlist exactly.

Correct production origin:

```text
https://utc-cafe.vercel.app
```

Incorrect example:

```text
https://utc-cafe.vercel.app/login
```

CORS checks the site origin only: protocol, domain, and port. It does not include page paths such as `/login`.

### 2. API path mismatch

The backend mounts auth routes under `/api/auth`, so login must call:

```text
https://utc-cafe.onrender.com/api/auth/login
```

Not:

```text
https://utc-cafe.onrender.com/auth/login
```

The frontend API client appends `/api` automatically, so `api.post('/auth/login')` resolves to the correct backend path.

### 3. Render environment variables

In Render, set:

```text
FRONTEND_URL=https://utc-cafe.vercel.app
NODE_ENV=production
```

Then redeploy the backend service.

### 4. Vercel environment variables

In Vercel, set:

```text
VITE_BACKEND_URL=https://utc-cafe.onrender.com
```

Then redeploy the frontend.

### 5. Quick checks

Test backend health:

```javascript
fetch('https://utc-cafe.onrender.com/api/health')
  .then((response) => response.json())
  .then(console.log)
  .catch(console.error);
```

If login still fails, check the browser Network tab and verify:

- Request URL is `/api/auth/login`.
- Request origin is `https://utc-cafe.vercel.app`.
- Response includes `Access-Control-Allow-Origin: https://utc-cafe.vercel.app`.
