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

## How to use the Reminder Generator

1. Open `reminder-generator.html` in a browser.
2. In Excel, select the tracker rows **including the header row** and copy.
3. Paste into the box and click **Jana Peringatan / Generate**.
4. Review each email, then **Copy** or **Open in Email**, and tick **Dihantar** once sent.
5. Click **Export reminder log (CSV)** to keep a record.

Recognised columns: Name/Nama, Email/Emel, Department/Jabatan, CAR No, Description/Isu, Due Date/Tarikh Akhir (dd/mm/yyyy), Status, Manager/Pengurus, Manager Email.

> Always review regulation references and deadlines before sending. Items marked `[SAHKAN RUJUKAN]` need verification.
