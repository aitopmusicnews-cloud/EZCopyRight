# CTS Management Hub

> **Register, fingerprint, and certify your original musical works instantly — all from your browser.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)
![Vite](https://img.shields.io/badge/Vite-7-646CFF.svg)
![TailwindCSS](https://img.shields.io/badge/Tailwind-4-38BDF8.svg)

---

## Secure Mode Setup

The app now supports authenticated storage with Supabase.

1. Copy `.env.example` to `.env`
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. Create a Supabase project with Email auth enabled
4. Run the SQL in [supabase/schema.sql](/Users/admin/COPYWRIGDHT/supabase/schema.sql)
5. Restart `npm run dev`

If Supabase env vars are missing, the app falls back to local demo auth and local browser storage.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 **Digital Fingerprint** | SHA-256 cryptographic hash generated from your audio file — unique, tamper-proof proof of ownership |
| 📜 **Instant Certificate** | Beautiful copyright certificate generated instantly with registration number, fingerprint, and timestamp |
| 📥 **Download Certificate** | Save your certificate as a high-res PNG image for your records |
| 📋 **Copy to Clipboard** | One-click copy for registration number, fingerprint, and file hash |
| 📊 **Dashboard** | View, search, filter, and manage all your registered works |
| 🎧 **Multi-Format Support** | MP3, WAV, FLAC, AAC, OGG, M4A, WMA, AIFF |
| 💾 **Persistent Storage** | All registrations saved in localStorage — no account needed |
| 🌙 **Dark Pro UI** | Professional dark-themed interface with smooth animations |

---

## 📁 Project Structure

```
soundseal/
├── index.html                  # HTML entry point
├── package.json                # Dependencies & scripts
├── vite.config.ts              # Vite + Tailwind + SingleFile config
├── tsconfig.json               # TypeScript config
├── src/
│   ├── main.tsx                # React DOM mount
│   ├── App.tsx                 # Root component (routing/state)
│   ├── index.css               # Global styles + Tailwind
│   ├── types.ts                # TypeScript interfaces
│   ├── utils/
│   │   ├── crypto.ts           # SHA-256 hashing & fingerprint generation
│   │   └── cn.ts               # Tailwind class merge utility
│   └── components/
│       ├── LandingHero.tsx     # Landing page with features & CTA
│       ├── RegisterForm.tsx    # Upload + metadata form
│       ├── Certificate.tsx     # Certificate viewer & downloader
│       └── Dashboard.tsx       # Registered works manager
└── README.md                   # ← You are here
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- **Node.js** ≥ 18 (recommended: 20+)
- **npm** ≥ 9

### 1. Clone / Download the project

```bash
git clone https://github.com/YOUR_USERNAME/soundseal.git
cd soundseal
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the dev server

```bash
npm run dev
```

The app will open at **http://localhost:5173** with hot-reload.

### 4. Build for production

```bash
npm run build
```

Output → `dist/index.html` (single self-contained file thanks to `vite-plugin-singlefile`).

### 5. Preview the production build locally

```bash
npm run preview
```

---

## 🌐 Make It LIVE — Deployment Guide

### Option 1: Vercel (Recommended — Easiest) ⭐

**Time: ~2 minutes | Free tier available**

#### A) One-Click Deploy (No CLI needed)

1. Push your code to **GitHub** / **GitLab** / **Bitbucket**
2. Go to [**vercel.com**](https://vercel.com) → Sign up / Log in
3. Click **"Add New Project"**
4. Import your repository
5. Vercel auto-detects Vite — just click **"Deploy"**
6. ✅ Your app is live at `https://your-project.vercel.app`

#### B) CLI Deploy

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy (follow prompts)
vercel

# Deploy to production
vercel --prod
```

---

### Option 2: Netlify (Also Excellent) ⭐

**Time: ~2 minutes | Free tier available**

#### A) Drag & Drop (Fastest!)

1. Run `npm run build`
2. Go to [**app.netlify.com/drop**](https://app.netlify.com/drop)
3. Drag the entire `dist/` folder onto the page
4. ✅ Instant live URL!

#### B) Git-Connected Deploy

1. Push code to GitHub
2. Go to [**netlify.com**](https://netlify.com) → Sign up / Log in
3. Click **"Add new site"** → **"Import an existing project"**
4. Connect your GitHub repo
5. Set build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
6. Click **"Deploy"**
7. ✅ Live at `https://your-site.netlify.app`

#### C) CLI Deploy

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build first
npm run build

# Deploy preview
netlify deploy --dir=dist

# Deploy to production
netlify deploy --dir=dist --prod
```

---

### Option 3: GitHub Pages (Free Forever) 🆓

1. **Install gh-pages:**
   ```bash
   npm install -D gh-pages
   ```

2. **Add to `package.json` scripts:**
   ```json
   {
     "scripts": {
       "deploy": "npm run build && gh-pages -d dist"
     }
   }
   ```

3. **Set base in `vite.config.ts`** (if repo is not root domain):
   ```ts
   export default defineConfig({
     base: '/your-repo-name/',
     // ... rest of config
   })
   ```

4. **Deploy:**
   ```bash
   npm run deploy
   ```

5. **Enable GitHub Pages:**
   - Go to repo → **Settings** → **Pages**
   - Source: **Deploy from a branch**
   - Branch: **gh-pages** / root
   - ✅ Live at `https://username.github.io/your-repo-name/`

---

### Option 4: Cloudflare Pages (Fast CDN) ⚡

1. Push code to GitHub
2. Go to [**dash.cloudflare.com**](https://dash.cloudflare.com) → **Workers & Pages**
3. Click **"Create application"** → **"Pages"** → **"Connect to Git"**
4. Select your repo
5. Set build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
6. Click **"Save and Deploy"**
7. ✅ Live at `https://your-project.pages.dev`

---

### Option 5: Firebase Hosting (Google Cloud) 🔥

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize (select "Hosting", use "dist" as public dir)
firebase init hosting

# Build
npm run build

# Deploy
firebase deploy --only hosting
```

✅ Live at `https://your-project.web.app`

---

### Option 6: Railway 🚂

1. Go to [**railway.app**](https://railway.app) → Sign up
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repo
4. Add build command: `npm run build`
5. Set start command: `npx serve dist -s`
6. ✅ Auto-deployed with a live URL

---

### Option 7: Surge.sh (Simplest CLI) 💨

```bash
# Install Surge
npm install -g surge

# Build
npm run build

# Deploy (follow prompts for email/domain)
surge dist your-app-name.surge.sh
```

✅ Live at `https://your-app-name.surge.sh`

---

### Option 8: Self-Hosted (VPS / DigitalOcean / AWS EC2) 🖥️

Since the build output is a **single static HTML file**, you can serve it with any web server:

```bash
# Build locally
npm run build

# Upload dist/index.html to your server, then:

# Option A: Nginx
sudo cp dist/index.html /var/www/html/
sudo systemctl restart nginx

# Option B: Simple Node server
npx serve dist -s -l 80

# Option C: Python (quick test)
cd dist && python3 -m http.server 80
```

**Nginx config example:**
```nginx
server {
    listen 80;
    server_name soundseal.yourdomain.com;
    root /var/www/soundseal;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 🔧 Custom Domain Setup

After deploying to any platform, add a custom domain:

| Platform | Steps |
|---|---|
| **Vercel** | Settings → Domains → Add domain → Update DNS |
| **Netlify** | Domain settings → Add custom domain → Update DNS |
| **Cloudflare** | Custom domains → Add domain (auto DNS if on CF) |
| **GitHub Pages** | Settings → Pages → Custom domain → Add CNAME file |

**DNS Records to add at your domain registrar:**
```
Type    Name    Value
A       @       76.76.21.21          (Vercel example)
CNAME   www     your-app.vercel.app  (Vercel example)
```

---

## 🛡️ Environment Checklist Before Going Live

- [ ] ✅ App builds without errors (`npm run build`)
- [ ] ✅ Certificate download works
- [ ] ✅ File upload & fingerprint generation works
- [ ] ✅ All pages navigate correctly
- [ ] ✅ Mobile responsive design verified
- [ ] ✅ Tested on Chrome, Firefox, Safari
- [ ] ✅ Custom domain configured (optional)
- [ ] ✅ HTTPS enabled (auto on Vercel/Netlify/Cloudflare)

---

## 💡 Tech Stack

| Technology | Purpose |
|---|---|
| **React 19** | UI framework |
| **TypeScript** | Type safety |
| **Vite 7** | Build tool & dev server |
| **Tailwind CSS 4** | Utility-first styling |
| **Web Crypto API** | SHA-256 fingerprint hashing (browser-native) |
| **html-to-image** | Certificate PNG export |
| **Lucide React** | Icon library |
| **localStorage** | Client-side data persistence |

---

## 📝 How It Works

1. **Upload** your audio file (MP3, WAV, FLAC, etc.)
2. **Fill in** work details (title, artist, genre, etc.)
3. **Submit** — the app generates a SHA-256 hash of your file bytes
4. **Certificate** is created instantly with a unique registration number
5. **Download** the certificate as a PNG image
6. **Dashboard** lets you view and manage all registrations

> ⚠️ **Note:** This is a client-side proof-of-concept. The SHA-256 hash provides a verifiable fingerprint of your file at a specific point in time. For legally binding copyright registration, consult your country's copyright office.

---

## 📄 License

MIT License — free for personal and commercial use.

---

**Built by CTS Management Hub**
