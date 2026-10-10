# CAR/PAR App – Deploy to Vercel + Supabase

About 30 minutes, all in the browser. You need three accounts: **GitHub** (you have it), **Supabase**, and **Vercel**. Sign up for both with your GitHub account.

What you end up with:
- `https://<your-app>.vercel.app`: auditor login, dashboard, CAR pages, settings
- Owners get emails with **Received / Dispute / Submit Evidence** buttons that open a page for their CAR (no login needed)
- Reminders run automatically every day at **08:00 Malaysia time**

---

## Part 1 – Supabase (database, login, file storage)

1. Go to **supabase.com ▸ New project**.
   - Name: `car-par`
   - Database password: generate one and save it in your password manager
   - Region: **Southeast Asia (Singapore)**
2. When it's ready, open **SQL Editor ▸ New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. You should see *Success*.
3. **Turn off public sign-up** (only auditors you add can log in):
   **Authentication ▸ Sign In / Providers ▸ Email**: switch **off** "Allow new users to sign up", then Save.
4. **Create your login:** **Authentication ▸ Users ▸ Add user ▸ Create new user**
   - Email: your work email
   - Password: a strong password
   - Tick **Auto Confirm User**
5. **Make yourself an auditor:** back in **SQL Editor**, run (with your email):
   ```sql
   insert into public.auditors (email, name) values ('you@yourcompany.com', 'HoongYau');
   ```
6. **Copy your keys:** **Project Settings ▸ API Keys** (also **Data API** for the URL). You need:
   - **Project URL**: `https://xxxx.supabase.co`
   - **anon / publishable** key
   - **service_role / secret** key. ⚠️ This one is a master key. It only goes into Vercel; never paste it anywhere else.

## Part 2 – Gmail App Password (for sending email)

1. Sign in to **myaccount.google.com** with the account that will send the emails (e.g. your work Gmail).
2. **Security ▸ 2-Step Verification**: turn it on if it isn't already.
3. Search for **App passwords** at the top of the page, create one named `CAR app`, and copy the 16-letter password.

> If "App passwords" is missing, your Google Workspace admin has disabled it. Ask IT to allow app passwords for your account, or to set up the SMTP relay for you.

## Part 3 – Vercel (hosting)

1. Go to **vercel.com ▸ Add New… ▸ Project** and import **hoongyauleong-coder/workshop-training**.
2. **Root Directory**: click *Edit* and choose **`car-app`**. Framework is detected as Next.js.
3. Open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Part 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
   | `GMAIL_USER` | the Gmail address from Part 2 |
   | `GMAIL_APP_PASSWORD` | the 16-letter app password |
   | `CRON_SECRET` | any long random text (e.g. 40 random letters/numbers) |
   | `APP_URL` | leave out for now |

4. Click **Deploy** and wait about 2 minutes.
5. Copy your site address (e.g. `https://workshop-training-xyz.vercel.app`). Then go to **Settings ▸ Environment Variables**, add **`APP_URL`** with that address (no `/` at the end), and **Deployments ▸ ⋯ ▸ Redeploy**.
6. Check **Settings ▸ Cron Jobs**: you should see `/api/cron/daily` at `0 0 * * *` (00:00 UTC = 08:00 MYT).

## Part 4 – Test everything (Test Mode is ON by default)

While **Test Mode** is on, every email goes **only to you**, with `[TEST]` in the subject and a yellow banner showing who would really get it.

1. Open your site and sign in.
2. **Settings**: check your name and title, and set **Auditor email** to your email. Save.
3. **+ CAR baharu**: create a CAR with **Owner email = your email** and HOD = your email. Tick *Send now*.
4. In your inbox, open the NC notice, click **RECEIVED**, then click the button on the page. You should get a confirmation with the due date.
5. Note the due date. In **Settings ▸ Simulated today**, enter each date below, save, then click **⏰ Run reminders now** on the Dashboard:
   - due date minus 5 working days → *Makluman*
   - due date plus 1 working day → *Peringatan Pertama*
   - 3 working days later → *Peringatan Kedua* (banner shows cc HOD)
   - 3 working days later → *Eskalasi Ke-3*
6. Click **Submit Evidence** in any email and upload a photo. You get a "Bukti Diterima" email, and the CAR shows the photo.
7. On the CAR page, try **Reject** (reminders resume), then **Close**.
8. Check **Log**: every email is listed.

## Part 5 – Go live
1. **Settings**: clear **Simulated today**, untick **Test Mode**, Save.
2. **Settings ▸ Public holidays**: check the dates marked *SAHKAN* against the official Malaysia + Penang list.
3. Delete or cancel your test CARs.

---

## Good to know
- **Adding another auditor:** Settings ▸ Auditors ▸ name, email, temporary password. They change it after their first login.
- **Vercel plan:** the free *Hobby* plan is for personal/non-commercial use. For company use Vercel expects the *Pro* plan (USD 20/month). Supabase's free plan is fine for this volume.
- **Supabase free projects pause after 7 days without activity.** The daily reminder run keeps it active.
- **Gmail limit:** about 2,000 emails/day for Workspace accounts.
- **Updating the app:** every push to GitHub `main` redeploys automatically.
- **Local development (optional):** copy `.env.example` to `.env.local`, fill it in, then `npm install` and `npm run dev`. Run tests with `npm test`.
