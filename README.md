# Workshop Training — Compliance Tools

Built during the AI Accelerator Founder Club workshop with Claude Code.

## Tools

| File | What it does |
| --- | --- |
| `reminder-generator.html` | **Compliance Reminder Generator.** Paste rows from the Excel CAR tracker; it groups open items by person, picks the escalation level (Due Soon / #1 Peringatan / #2 Tindakan Segera / #3 Eskalasi with manager cc), and writes each reminder in mixed BM + English, ready to copy into ECOM. Exports a reminder log CSV for the audit trail. Runs fully offline — open the file in any browser. |
| `index.html` | Compliance Department introduction page (DOE, DOSH, Company SOP). |
| `my-walkthrough-skill.md` | Claude skill: turns rough walkthrough notes into formal findings for the monthly inspection report. |
| `walkthrough-findings-sample.csv` | Sample output of the walkthrough skill (fictional data). Opens in Excel. |
| `CLAUDE.md` / `business-brain.md` | Context Claude Code reads automatically when working in this folder. |

## CAR/PAR Web App (`car-app/`) – Vercel + Supabase

The full CAR/PAR system as a web app: auditor login and dashboard, owner pages with **Received / Dispute / photo evidence upload**, Gmail SMTP emails, and a daily 08:00 MYT reminder run on Vercel Cron. Same workflow and email wording as the Apps Script version below.

👉 **Deploy guide: [`car-app/DEPLOY.md`](car-app/DEPLOY.md)**

## CAR/PAR Email Automation (`car-automation/`) – Google Sheets version

Full walkthrough-to-closure automation on **Google Sheets + Apps Script**:

- NC email to the owner with **Received** / **Dispute** buttons
- Daily "please acknowledge" reminder until Received is clicked
- **14-working-day** closure clock from acknowledgement (skips weekends and Malaysia + Penang public holidays)
- Reminders: 5 days before due → 1 day after due → +3 days cc HOD → every 3 days cc HOD until closed
- Evidence via Google Form (pauses reminders), auditor verifies → Close or Reject
- Extensions, reassignment, effectiveness check 30 working days after closure
- Every email logged in `Email_Log`, plus a `Dashboard`

👉 **Setup guide: [`car-automation/SETUP.md`](car-automation/SETUP.md)**

## How to use the Reminder Generator

1. Open `reminder-generator.html` in a browser.
2. In Excel, select the tracker rows **including the header row** and copy.
3. Paste into the box and click **Jana Peringatan / Generate**.
4. Review each email, then **Copy** or **Open in Email**, and tick **Dihantar** once sent.
5. Click **Export reminder log (CSV)** to keep a record.

Recognised columns: Name/Nama, Email/Emel, Department/Jabatan, CAR No, Description/Isu, Due Date/Tarikh Akhir (dd/mm/yyyy), Status, Manager/Pengurus, Manager Email.

> Always review regulation references and deadlines before sending. Items marked `[SAHKAN RUJUKAN]` need verification.
