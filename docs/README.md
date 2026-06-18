# Dublin Cleaners Expense Categorization App

## Overview

This Google Apps Script HTMLService application lets Dublin Cleaners upload monthly corporate credit card PDF statements, parse employee expense lines, and route those charges to employees for categorization. Google Sheets is the database, and all protected reads and writes occur server-side.

## Auth Flow

Dev access is restricted to these Google accounts:

- `skhun@dublincleaners.com`
- `ss.sku@gmail.com`

Every Dev server function calls a server-side authorization check based on `Session.getActiveUser().getEmail()`. Unauthorized users receive a branded Unauthorized screen and cannot retrieve employees, uploads, expense data, or upload logic.

Employees do not need Google account authorization. They log in with first name and a 4-digit PIN. PINs are salted and hashed with Apps Script `Utilities.computeDigest`; plaintext PINs are never stored.

## Database Model

The app auto-creates a spreadsheet named **Dublin Cleaners Expense Database** and stores its ID in Script Properties. Required sheets are created or reused:

- `Settings`
- `Employees`
- `Uploads`
- `Expenses`
- `TrainingFeedback`
- `AuditLog`

Rows include timestamps and actor fields to preserve history and audit important actions.

## PDF Upload and Parsing Flow

1. A Dev user uploads a PDF with a statement month.
2. The server validates authorization, month, file type, and file bytes.
3. The server computes a SHA-256 file hash and rejects duplicate completed uploads for the same month.
4. The PDF is stored in Drive.
5. Apps Script uses the Advanced Drive service to convert the PDF to a Google Doc with OCR enabled.
6. The converted document text is parsed with robust statement-line patterns that extract employee name, date, and description.
7. Parsed rows are matched to employee accounts by first name and inserted into `Expenses` with suggested categories.
8. Upload status is updated to completed or failed, and important actions are written to `AuditLog`.

## Auto-Categorization Logic

The categorization engine combines:

- category keyword scoring,
- normalized description matching,
- historical correction feedback from `TrainingFeedback`, and
- weighted similarity scoring for prior corrections.

When an employee overrides a suggestion, the correction is stored as training feedback. Similar future descriptions receive stronger scores for the corrected category.

## Loading and Performance Strategy

The HTML shell renders immediately. A branded loading overlay appears before server calls and includes:

- Dublin Cleaners logo,
- “Preparing your workspace…” message,
- a UX-paced 4-second countdown,
- a smooth fade-out after bootstrap data arrives.

Data hydration occurs after paint with batched `google.script.run` calls. CSS is inline through `styles.html`, DOM updates are lightweight, and read-heavy bootstrap data is returned in one server call.

## Category Guide Placeholder

The Category Guide modal lists all 23 required categories with future-ready policy text. It does not block core expense workflows.

## Setup Steps

1. Create a new Google Apps Script project.
2. Copy these files into the project:
   - `appsscript.json`
   - `Code.gs`
   - `index.html`
   - `styles.html`
   - `scripts.html`
   - `print.html`
   - `test/ExpenseTests.gs`
3. In Apps Script Services, enable **Drive API** advanced service.
4. In the linked Google Cloud project, enable the Google Drive API.
5. Save the project and run `runAppsScriptTests()` once to authorize required scopes.

## Deployment Steps

1. Open Apps Script **Deploy > New deployment**.
2. Choose **Web app**.
3. Execute as the deploying user so the app can own the database spreadsheet and Drive conversions.
4. Set access according to company policy.
5. Share the deployment URL with Dev users and employees.

## Testing Steps

Run `runAppsScriptTests()` from the Apps Script editor. The tests cover:

- sheet initialization,
- Dev authorization allowlist logic,
- PIN hashing and validation,
- category validation,
- PDF parsing helper patterns,
- categorization scoring,
- similarity learning support,
- employee session handling,
- duplicate upload hash determinism.

## Known Assumptions

- Statement rows contain an employee name, a recognizable date, and a description on the same OCR text line.
- Employee matching is by first name because employee login accounts are first-name based.
- The Advanced Drive API is available for PDF-to-Doc OCR conversion.
- The app works without paid AI APIs.

## Future Improvements

- Add finance-owned policy text for each category.
- Add an admin export button for monthly reports.
- Add optional cardholder aliases if statements do not use first names consistently.
- Add richer parsing patterns after reviewing real statement samples.
