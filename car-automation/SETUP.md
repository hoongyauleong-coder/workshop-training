# CAR/PAR Email Automation – Setup Guide

Google Sheets + Apps Script. No server, no terminal. About 20 minutes.

## How it works

```
Walkthrough → Finding → NC row in CAR_Register
   → 📨 Send new CARs ─► Owner gets email with [RECEIVED] [Dispute]
        no click?  ─► "Mohon sahkan penerimaan" every working day until clicked
        Dispute    ─► you get the reason → 👤 Reassign owner
   → Owner clicks RECEIVED ─► Day 0. Due = +14 working days (weekends & holidays skipped)
        Due − 5 WD  ─► Makluman (friendly)
        Due + 1 WD  ─► Peringatan Pertama (firm)
        + 3 WD      ─► Peringatan Kedua, cc HOD
        every + 3 WD ─► Eskalasi Ke-3, Ke-4 … cc HOD (+ extra CC) until Closed
   → Owner submits evidence (Google Form) ─► reminders PAUSE, you get an email
        ✅ Close selected CAR  ─► owner + HOD notified
        ↩️ Reject evidence     ─► owner notified, reminders resume
   → Closed + 30 WD ─► effectiveness check reminder to you (ISO 14001 cl. 10.2)
```

Every email and action is recorded in **Email_Log**. **Dashboard** shows open / overdue / closed-on-time %.

---

## Step 1 – Create the Sheet
1. Go to **sheets.new** and sign in with your company Google account.
2. Name it **CAR/PAR Register**.

## Step 2 – Paste the code
1. In the Sheet: **Extensions ▸ Apps Script**.
2. Rename the project (top left) to **CAR/PAR Automation**.
3. Delete everything in `Code.gs`, then rename `Code.gs` to `Setup` and paste in the contents of **Setup.gs**.
4. For each of these files click **+ ▸ Script**, type the name (without `.gs`), and paste the file's contents:
   `Workdays`, `Templates`, `Mailer`, `WebApp`, `Daily`, `Menu`
5. Click **⚙ Project Settings** ▸ tick **Show "appsscript.json" manifest file**. Go back to **Editor**, open `appsscript.json`, and replace its contents with **appsscript.json** from this folder.
6. Click **💾 Save**.

## Step 3 – Build the sheets
1. In the toolbar function dropdown choose **setup**, click **▶ Run**.
2. Google asks for permission: **Review permissions ▸ your account ▸ Allow**.
   If you see *"Google hasn't verified this app"*: **Advanced ▸ Go to CAR/PAR Automation**. It's your own script.
3. Go back to the Sheet and **reload the page**. A **Compliance** menu appears.

You now have: `CAR_Register`, `Dashboard`, `Settings`, `Holidays`, `Email_Log`.

## Step 4 – Deploy the "Received" button (Web App)
1. In Apps Script: **Deploy ▸ New deployment ▸ ⚙ ▸ Web app**.
2. **Execute as:** Me. **Who has access:** *Anyone within [your company]*.
   (If some owners don't have company Google accounts, choose *Anyone*. Each link has a secret per-CAR token, so it can't be guessed.)
3. **Deploy**, then copy the **Web app URL** (ends in `/exec`).
4. Paste it into **Settings ▸ Web App URL**.

## Step 5 – Create the evidence form
**Compliance ▸ Setup ▸ 2. Create evidence form.**
The form link (with the CAR No pre-filled) is saved into Settings automatically.
Optional: open the form and add a **File upload** question for photos.

## Step 6 – Install the daily trigger
**Compliance ▸ Setup ▸ 3. Install triggers.**
Reminders now run every working day at about 08:00, and evidence submissions are picked up automatically.

## Step 7 – Test the full flow (Test Mode = TRUE)
With **Test Mode = TRUE**, every email goes to **you only** with `[TEST]` in the subject and a banner showing who would receive it.

1. In `CAR_Register`, add one row: Area, Finding, Owner Name, **Owner Email = your email**, HOD Name, HOD Email.
2. **Compliance ▸ Send new CARs** → you get the NC notice.
3. Click **RECEIVED** in the email → the page shows the due date and you get a confirmation.
4. Look at the **Due Date** in the register. Then in **Settings ▸ Simulated Today** enter each date below and click **Compliance ▸ Run reminders now** each time:
   - Due date minus 5 working days → *Makluman*
   - Due date plus 1 working day → *Peringatan Pertama*
   - 3 working days later → *Peringatan Kedua* (banner shows cc HOD)
   - 3 working days later → *Eskalasi Ke-3*
5. Open the evidence link from any email and submit → status becomes *Evidence Submitted*, you get a "Bukti Diterima" email, and reminders stop.
6. Select the row ▸ **Compliance ▸ Close selected CAR** → closure email.
7. Check **Email_Log**: every step is there.

## Step 8 – Go live
1. **Settings ▸ Simulated Today** → **clear it** (blank).
2. **Settings ▸ Test Mode** → **FALSE**.
3. Check the **Holidays** tab against the official Malaysia + Penang holiday list. Rows marked *SAHKAN* are estimates. Add next year's list every December.
4. Delete the test row.

---

## Daily use

**After a walkthrough:** add one row per finding. You fill only these columns. Everything else is automatic:

| Column | Example |
| --- | --- |
| Area/Dept | Stor Buangan Terjadual |
| Finding | Spill kit kosong |
| Requirement/Ref | EQ (Scheduled Wastes) Regulations 2005, Reg. 10 |
| Severity | Major NC |
| Owner Name / Owner Email | Ahmad / ahmad@company.com |
| HOD Name / HOD Email | En. Rosli / rosli@company.com |

From the `/my-walkthrough` skill output: *Area → Area/Dept, Description → Finding, Reference → Requirement/Ref, PIC → Owner Name*.
Leave **CAR No** blank to auto-number (`CAR-2026-10-001`), then **Compliance ▸ Send new CARs**.

**Menu actions** (click a row in `CAR_Register` first):
- **✅ Close selected CAR**: after you verify evidence. Owner + HOD notified.
- **↩️ Reject evidence**: you type the reason; owner is emailed; reminders resume.
- **📅 Approve extension**: new due date; reminder ladder restarts from the new date.
- **👤 Reassign owner**: after a dispute; new owner gets a fresh notice and the old link stops working.
- To cancel a CAR raised by mistake, set **Status = Cancelled**.

Don't type into the automatic columns (Status apart from Cancelled, dates, Last Stage, Token).

## If you change the code later
Changes to the reminder logic apply immediately. Changes that affect the Received/Dispute page need **Deploy ▸ Manage deployments ▸ ✏ ▸ Version: New version ▸ Deploy** (the URL stays the same).

## Limits
- Google Workspace can send about 1,500 emails/day from a script, far more than needed.
- Times run on Asia/Kuala_Lumpur. The daily run happens between 08:00 and 09:00.
- Owners can never close their own CAR. Only the auditor closes after verification.
