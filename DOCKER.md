# UTC Café — Docker Setup Guide

## Requirements
- Docker Desktop installed (docker.com/get-started)
- Git installed

---

## Step 1 — Clone the repo

```bash
git clone https://github.com/manikanta298/utc-cafe.git
cd utc-cafe
```

---

## Step 2 — Create backend environment file

Create a file at `backend/.env` with these values:

```env
PORT=5000
MONGO_URI=mongodb://mongo:27017/utc_cafe
JWT_SECRET=your_secret_key_here
JWT_REFRESH_SECRET=your_refresh_secret_here
FRONTEND_URL=http://localhost

# Email (for forgot password)
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password

# Optional
SMS_ENABLED=false
```

> For a new client deployment, just change FRONTEND_URL to their domain.

---

## Step 3 — Run everything (one command)

```bash
docker-compose up --build
```

Wait 2-3 minutes for first build. After that:

- **Frontend** → http://localhost
- **Backend API** → http://localhost:5000/api
- **MongoDB** → localhost:27017 (data saved permanently in Docker volume)

---

## Step 4 — Run in background

```bash
docker-compose up --build -d
```

---

## Step 5 — Stop everything

```bash
docker-compose down
```

---

## Deploy to a VPS (DigitalOcean / AWS)

```bash
# 1. SSH into your server
ssh root@YOUR_SERVER_IP

# 2. Install Docker
curl -fsSL https://get.docker.com | sh

# 3. Install Docker Compose
apt install docker-compose -y

# 4. Clone your repo
git clone https://github.com/manikanta298/utc-cafe.git
cd utc-cafe

# 5. Create backend/.env with your values

# 6. Run
docker-compose up --build -d
```

Your app is now live at your server IP.

---

## New Client Deployment (55+ branch franchise)

1. Clone the repo into a new folder
2. Change `backend/.env`:
   - Set their `EMAIL_USER`, `EMAIL_PASS`
   - Set `FRONTEND_URL` to their domain
3. In `docker-compose.yml` change `VITE_API_URL` to their API domain
4. Run `docker-compose up --build -d`
5. Create their master admin account via the seed script or API
6. Done — fully isolated instance for that client

---

## Update the app after code changes

```bash
git pull
docker-compose up --build -d
```

---

## View logs

```bash
# All services
docker-compose logs -f

# Just backend
docker-compose logs -f backend

# Just frontend
docker-compose logs -f frontend
```

---

## Database backup

```bash
docker exec utc-mongo mongodump --out /data/backup
docker cp utc-mongo:/data/backup ./backup
```
