# SpinReward SaaS v2 — Setup Guide

## ধাপ ১ — Supabase Setup
1. https://supabase.com → New Project তৈরি করুন
2. SQL Editor → `database/schema.sql` পুরো code paste করে Run করুন
3. Settings → API থেকে:
   - Project URL
   - anon/public key

## ধাপ ২ — Environment Variables
প্রজেক্ট root-এ `.env` ফাইল তৈরি করুন:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## ধাপ ৩ — GitHub Upload
এই ফাইলগুলো GitHub-এ upload করুন (`.env` বাদে):
- src/
- database/
- index.html, package.json, vite.config.js, vercel.json

## ধাপ ৪ — Vercel Deploy
1. vercel.com → GitHub repo connect
2. Environment Variables-এ VITE_SUPABASE_URL ও VITE_SUPABASE_ANON_KEY যোগ করুন
3. Deploy!

## URL গুলো
| URL | কাজ |
|-----|-----|
| `/` | Landing page (sales) |
| `/register` | নতুন রেস্টুরেন্ট signup |
| `/login` | রেস্টুরেন্ট login |
| `/dashboard` | রেস্টুরেন্ট owner dashboard |
| `/r/:slug` | Customer spin wheel |
| `/redeem?code=XXX` | Cashier coupon verify |

## Customer Flow
QR Scan → `/r/sampan` → Spin → জেতা → Coupon Modal → Facebook Share → Cashier Redeem `/redeem`

## ফাইল Structure
```
spinreward-v2/
├── src/
│   ├── lib/supabase.js       ← সব DB queries
│   ├── pages/
│   │   ├── Landing.jsx       ← Sales page
│   │   ├── Auth.jsx          ← Login/Register
│   │   ├── Dashboard.jsx     ← Restaurant admin
│   │   ├── WheelPage.jsx     ← Public spin wheel + coupon + share
│   │   └── RedeemPage.jsx    ← Cashier coupon verify
│   ├── App.jsx               ← Router
│   └── main.jsx
├── database/schema.sql
├── index.html
├── package.json
├── vite.config.js
└── vercel.json
```
