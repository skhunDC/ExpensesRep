/** Dublin Cleaners Expense Categorization Web App */
const APP = {
  name: 'Dublin Cleaners Expense Workspace',
  logoUrl: 'https://www.dublincleaners.com/wp-content/uploads/2024/12/Dublin-Logos-stacked.png',
  spreadsheetName: 'Dublin Cleaners Expense Database',
  settingsSpreadsheetIdKey: 'spreadsheetId',
  sessionTtlSeconds: 21600,
  devEmails: ['skhun@dublincleaners.com', 'ss.sku@protonmail.com'],
  categories: ['Account', 'Advertising', 'Computer Claims', 'Cleaning Supplies', 'Contributions', 'Delivery', 'Distribution Dues', 'Meals', 'Employee Welfare / Entertainment / Gifts', 'Insurance', 'Leased Technology', 'Legal Professional Licenses', 'Maintenance', 'Miscellaneous', 'Office', 'Outside Services', 'Postage', 'Recruiting', 'Telephone', 'Training', 'Meetings', 'Travel', 'Utilities'],
  sheets: {
    Settings: ['key', 'value', 'updatedAt', 'updatedBy'],
    Employees: ['employeeId', 'firstName', 'normalizedFirstName', 'pinHash', 'pinSalt', 'isActive', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
    Uploads: ['uploadId', 'statementMonth', 'originalFilename', 'fileId', 'fileHash', 'status', 'rowCount', 'createdAt', 'createdBy'],
    Expenses: ['expenseId', 'uploadId', 'statementMonth', 'employeeId', 'employeeNameRaw', 'expenseDate', 'description', 'normalizedDescription', 'suggestedCategory', 'confidence', 'selectedCategory', 'categorizedAt', 'categorizedBy', 'status', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
    TrainingFeedback: ['feedbackId', 'expenseId', 'normalizedDescription', 'suggestedCategory', 'selectedCategory', 'confidence', 'employeeId', 'createdAt', 'createdBy'],
    AuditLog: ['auditId', 'action', 'actor', 'actorType', 'details', 'createdAt']
  }
};

const KEYWORDS = {
  'Meals': ['restaurant','cafe','coffee','lunch','dinner','breakfast','doordash','uber eats','grubhub','pizza','bakery','catering','mcdonald','starbucks','chipotle','meal'],
  'Travel': ['airline','hotel','lodging','uber','lyft','taxi','rental car','parking','fuel','gas station','toll','flight','airport','marriott','hilton'],
  'Office': ['office','paper','staples','supplies','ink','toner','desk','printer','amazon'],
  'Cleaning Supplies': ['cleaning','detergent','sanitizer','bleach','janitorial','soap','disinfectant','supplies'],
  'Advertising': ['advertising','ads','google ads','facebook','meta','marketing','print ad','promo'],
  'Computer Claims': ['computer','laptop','software','microsoft','adobe','subscription','domain','hosting','keyboard','monitor'],
  'Delivery': ['delivery','courier','fedex','ups','shipping','ship'],
  'Postage': ['postage','usps','postal','stamps'],
  'Telephone': ['phone','telephone','verizon','att','t-mobile','mobile','wireless'],
  'Utilities': ['electric','water','gas bill','utility','utilities','internet','comcast','xfinity'],
  'Maintenance': ['repair','maintenance','parts','service call','hardware','plumbing','electrical'],
  'Insurance': ['insurance','premium','policy'],
  'Legal Professional Licenses': ['legal','attorney','law','license','permit','professional','notary'],
  'Training': ['training','course','class','seminar','certification','webinar'],
  'Recruiting': ['recruiting','job','indeed','linkedin','background check','hiring'],
  'Meetings': ['meeting','conference room','event space'],
  'Employee Welfare / Entertainment / Gifts': ['gift','flowers','entertainment','team','employee welfare','bonus','party'],
  'Outside Services': ['consulting','contractor','outside service','service provider','vendor'],
  'Leased Technology': ['lease','leased technology','copier lease','equipment lease'],
  'Distribution Dues': ['dues','membership','association'],
  'Contributions': ['donation','contribution','charity'],
  'Account': ['bank','accounting','quickbooks','fee','finance charge'],
  'Miscellaneous': ['misc','other']
};

function doGet() {
  ensureDatabase_();
  return HtmlService.createTemplateFromFile('index').evaluate().setTitle(APP.name).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function getBootstrap() {
  ensureDatabase_();
  const email = currentEmail_();
  const isDev = isDevEmail_(email);
  return { appName: APP.name, logoUrl: APP.logoUrl, isDev, email: isDev ? email : '', categories: APP.categories, months: getMonths_(), currentMonth: monthKey_(new Date()) };
}

function getDevDashboard(filters) {
  requireDev_(); ensureDatabase_();
  filters = filters || {};
  const employees = asArray_(readRows_('Employees')).filter(r => String(r.isActive) === 'true').map(safeEmployee_);
  const uploads = asArray_(readRows_('Uploads')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const expenses = asArray_(readRows_('Expenses')).filter(r => (!filters.month || r.statementMonth === filters.month) && (!filters.employeeId || r.employeeId === filters.employeeId)).map(safeExpense_);
  return { employees, uploads, expenses, months: asArray_(getMonths_()), categories: APP.categories };
}

function createEmployee(firstName, pin) {
  requireDev_(); ensureDatabase_();
  firstName = cleanName_(firstName); validatePin_(pin);
  const normalized = normalizeName_(firstName);
  const rows = readRows_('Employees');
  if (rows.some(r => r.normalizedFirstName === normalized && String(r.isActive) === 'true')) throw userError_('An active employee with that first name already exists.');
  if (rows.some(r => String(r.isActive) === 'true' && verifyPin_(pin, r.pinSalt, r.pinHash))) throw userError_('That PIN is already assigned. Choose a different 4-digit PIN.');
  const salt = newId_('salt');
  const now = iso_();
  appendRow_('Employees', { employeeId: newId_('emp'), firstName, normalizedFirstName: normalized, pinHash: hashPin_(pin, salt), pinSalt: salt, isActive: true, createdAt: now, createdBy: currentEmail_(), updatedAt: now, updatedBy: currentEmail_() });
  audit_('EMPLOYEE_CREATED', currentEmail_(), 'DEV', { firstName });
  return { ok: true };
}

function employeeLogin(firstName, pin) {
  ensureDatabase_(); firstName = cleanName_(firstName); validatePin_(pin);
  const employee = readRows_('Employees').find(r => r.normalizedFirstName === normalizeName_(firstName) && String(r.isActive) === 'true');
  if (!employee || !verifyPin_(pin, employee.pinSalt, employee.pinHash)) { audit_('EMPLOYEE_LOGIN_FAILED', firstName, 'EMPLOYEE', {}); throw userError_('Login failed. Check your first name and 4-digit PIN.'); }
  const token = newId_('sess');
  CacheService.getScriptCache().put('session:' + token, JSON.stringify({ employeeId: employee.employeeId, firstName: employee.firstName, createdAt: iso_() }), APP.sessionTtlSeconds);
  audit_('EMPLOYEE_LOGIN', employee.employeeId, 'EMPLOYEE', {});
  return { token, employee: { employeeId: employee.employeeId, firstName: employee.firstName }, months: getMonths_(), categories: APP.categories };
}

function getEmployeeExpenses(token, month) {
  const session = requireEmployeeSession_(token); ensureDatabase_();
  month = month || monthKey_(new Date());
  const expenses = readRows_('Expenses').filter(r => r.employeeId === session.employeeId && r.statementMonth === month).map(safeExpense_);
  return { employee: { employeeId: session.employeeId, firstName: session.firstName }, expenses, months: getMonths_(), categories: APP.categories, month };
}

function saveExpenseCategory(token, expenseId, selectedCategory) {
  const session = requireEmployeeSession_(token); ensureDatabase_(); validateCategory_(selectedCategory);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const table = getTable_('Expenses');
    const data = table.sheet.getDataRange().getValues();
    const h = indexMap_(data[0]);
    for (let i = 1; i < data.length; i++) {
      if (data[i][h.expenseId] === expenseId) {
        if (data[i][h.employeeId] !== session.employeeId) throw userError_('You can only update your own expenses.');
        const suggested = data[i][h.suggestedCategory];
        const confidence = data[i][h.confidence];
        data[i][h.selectedCategory] = selectedCategory; data[i][h.categorizedAt] = iso_(); data[i][h.categorizedBy] = session.employeeId; data[i][h.status] = 'categorized'; data[i][h.updatedAt] = iso_(); data[i][h.updatedBy] = session.employeeId;
        table.sheet.getRange(i + 1, 1, 1, data[0].length).setValues([data[i]]);
        if (selectedCategory !== suggested) appendRow_('TrainingFeedback', { feedbackId: newId_('fb'), expenseId, normalizedDescription: data[i][h.normalizedDescription], suggestedCategory: suggested, selectedCategory, confidence, employeeId: session.employeeId, createdAt: iso_(), createdBy: session.employeeId });
        audit_('EXPENSE_CATEGORIZED', session.employeeId, 'EMPLOYEE', { expenseId, selectedCategory });
        return { ok: true };
      }
    }
    throw userError_('Expense record was not found.');
  } finally { lock.releaseLock(); }
}

function uploadStatement(payload) {
  requireDev_(); ensureDatabase_();
  if (!payload || !payload.statementMonth || !/^\d{4}-\d{2}$/.test(payload.statementMonth)) throw userError_('Select a valid statement month.');
  if (!payload.filename || !/\.pdf$/i.test(payload.filename)) throw userError_('Upload a valid PDF file.');
  const bytes = Utilities.base64Decode(String(payload.base64 || '').replace(/^data:application\/pdf;base64,/, ''));
  if (!bytes.length) throw userError_('The uploaded PDF was empty.');
  const hash = digestHex_(bytes);
  if (readRows_('Uploads').some(u => u.statementMonth === payload.statementMonth && u.fileHash === hash && u.status === 'completed')) throw userError_('This statement file has already been uploaded for the selected month.');
  const blob = Utilities.newBlob(bytes, 'application/pdf', payload.filename);
  const file = DriveApp.createFile(blob);
  const uploadId = newId_('upl');
  appendRow_('Uploads', { uploadId, statementMonth: payload.statementMonth, originalFilename: payload.filename, fileId: file.getId(), fileHash: hash, status: 'processing', rowCount: 0, createdAt: iso_(), createdBy: currentEmail_() });
  try {
    const text = extractPdfText_(file.getId(), payload.filename);
    const parsed = parseStatementText_(text);
    if (!parsed.length) throw userError_('No expense line items could be found in this PDF. Confirm it contains selectable or OCR-readable statement text.');
    const employees = readRows_('Employees');
    let inserted = 0;
    parsed.forEach(item => {
      const employee = matchEmployee_(item.employeeName, employees);
      const suggestion = suggestCategory_(item.description);
      appendRow_('Expenses', { expenseId: newId_('exp'), uploadId, statementMonth: payload.statementMonth, employeeId: employee ? employee.employeeId : '', employeeNameRaw: item.employeeName, expenseDate: item.date, description: item.description, normalizedDescription: normalizeDescription_(item.description), suggestedCategory: suggestion.category, confidence: suggestion.confidence, selectedCategory: '', categorizedAt: '', categorizedBy: '', status: employee ? 'needs_category' : 'unmatched_employee', createdAt: iso_(), createdBy: currentEmail_(), updatedAt: iso_(), updatedBy: currentEmail_() });
      inserted++;
    });
    updateUploadStatus_(uploadId, 'completed', inserted); audit_('PDF_UPLOADED', currentEmail_(), 'DEV', { uploadId, rowCount: inserted });
    return { ok: true, rowCount: inserted, uploadId };
  } catch (err) { updateUploadStatus_(uploadId, 'failed', 0); audit_('PDF_UPLOAD_FAILED', currentEmail_(), 'DEV', { message: err.message }); throw err; }
}

function extractPdfText_(fileId, title) {
  try {
    const resource = { title: title.replace(/\.pdf$/i, '') + ' OCR', mimeType: MimeType.GOOGLE_DOCS };
    const docFile = Drive.Files.copy(resource, fileId, { ocr: true, ocrLanguage: 'en' });
    const doc = DocumentApp.openById(docFile.id);
    const text = doc.getBody().getText();
    DriveApp.getFileById(docFile.id).setTrashed(true);
    if (!text || text.trim().length < 20) throw new Error('Converted PDF had no readable text.');
    return text;
  } catch (err) { throw userError_('PDF parsing failed: ' + err.message); }
}

function parseStatementText_(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  const patterns = [
    /^([A-Za-z][A-Za-z .'-]+?)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.+?)(?:\s+[-$]?\d+[\d,]*\.\d{2})?$/,
    /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+([A-Za-z][A-Za-z .'-]+?)\s+(.+?)(?:\s+[-$]?\d+[\d,]*\.\d{2})?$/
  ];
  lines.forEach(line => {
    if (/^(date|employee|description|amount|total|payment|balance)\b/i.test(line)) return;
    let m = line.match(patterns[0]);
    if (m) out.push({ employeeName: cleanName_(m[1]), date: normalizeDate_(m[2]), description: cleanDescription_(m[3]) });
    else if ((m = line.match(patterns[1]))) out.push({ employeeName: cleanName_(m[2]), date: normalizeDate_(m[1]), description: cleanDescription_(m[3]) });
  });
  return out.filter(r => r.employeeName && r.date && r.description.length > 2);
}

function suggestCategory_(description) {
  const norm = normalizeDescription_(description); const feedback = readRows_('TrainingFeedback'); const scores = {}; APP.categories.forEach(c => scores[c] = 0.01);
  Object.keys(KEYWORDS).forEach(cat => KEYWORDS[cat].forEach(k => { if (norm.indexOf(k) > -1) scores[cat] += 2 + Math.min(k.length / 10, 2); }));
  feedback.forEach(f => { const sim = similarity_(norm, f.normalizedDescription); if (sim >= 0.35) scores[f.selectedCategory] += 7 * sim; });
  const sorted = APP.categories.map(c => ({ category: c, score: scores[c] })).sort((a,b)=>b.score-a.score);
  const total = sorted.reduce((s,x)=>s+x.score,0); return { category: sorted[0].category, confidence: Math.max(35, Math.min(98, Math.round((sorted[0].score / total) * 100))) };
}
function runAppsScriptTests() { return ExpenseTests.runAll(); }

function ensureDatabase_() {
  const props = PropertiesService.getScriptProperties(); let id = props.getProperty(APP.settingsSpreadsheetIdKey); let ss;
  try { if (id) ss = SpreadsheetApp.openById(id); } catch(e) { id = ''; }
  if (!ss) { ss = SpreadsheetApp.create(APP.spreadsheetName); props.setProperty(APP.settingsSpreadsheetIdKey, ss.getId()); }
  Object.keys(APP.sheets).forEach(name => { let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name); const headers = APP.sheets[name]; if (sh.getLastRow() === 0) sh.appendRow(headers); else sh.getRange(1,1,1,headers.length).setValues([headers]); });
  return ss;
}
function getTable_(name) { return { sheet: ensureDatabase_().getSheetByName(name), headers: APP.sheets[name] }; }
function readRows_(name) { const sh = getTable_(name).sheet; const values = sh.getDataRange().getValues(); if (values.length < 2) return []; const headers = values[0]; return values.slice(1).filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(headers.map((h,i)=>[h, r[i]]))); }
function appendRow_(name, obj) { const headers = APP.sheets[name]; getTable_(name).sheet.appendRow(headers.map(h => obj[h] === undefined ? '' : obj[h])); }
function indexMap_(headers) { const m = {}; headers.forEach((h,i)=>m[h]=i); return m; }
function updateUploadStatus_(uploadId, status, rowCount) { const t = getTable_('Uploads'), v = t.sheet.getDataRange().getValues(), h = indexMap_(v[0]); for (let i=1;i<v.length;i++) if (v[i][h.uploadId]===uploadId) { t.sheet.getRange(i+1,h.status+1).setValue(status); t.sheet.getRange(i+1,h.rowCount+1).setValue(rowCount); } }
function normalizeEmail_(email) { return String(email || '').trim().toLowerCase(); }
function currentEmail_() { return normalizeEmail_(Session.getActiveUser().getEmail()); }
function isDevEmail_(email) { return APP.devEmails.indexOf(normalizeEmail_(email)) > -1; }
function requireDev_() { if (!isDevEmail_(currentEmail_())) { audit_('UNAUTHORIZED_DEV_ACCESS', currentEmail_(), 'UNKNOWN', {}); throw userError_('You are not authorized to access Dev tools.'); } }
function requireEmployeeSession_(token) { const raw = CacheService.getScriptCache().get('session:' + token); if (!raw) throw userError_('Your session expired. Please log in again.'); return JSON.parse(raw); }
function hashPin_(pin, salt) { return digestHex_(Utilities.newBlob(salt + ':' + pin).getBytes()); }
function verifyPin_(pin, salt, hash) { return hashPin_(pin, salt) === hash; }
function validatePin_(pin) { if (!/^\d{4}$/.test(String(pin || ''))) throw userError_('PIN must be exactly 4 digits.'); }
function validateCategory_(cat) { if (APP.categories.indexOf(cat) === -1) throw userError_('Select a valid expense category.'); }
function normalizeName_(s) { return String(s||'').trim().toLowerCase().replace(/[^a-z]/g, ''); }
function cleanName_(s) { return String(s||'').trim().replace(/\s+/g, ' '); }
function cleanDescription_(s) { return String(s||'').replace(/\s+[-$]?\d+[\d,]*\.\d{2}$/, '').trim(); }
function normalizeDescription_(s) { return String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
function normalizeDate_(s) { const d = new Date(s); return isNaN(d) ? s : Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function monthKey_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM'); }
function getMonths_() { const set = {}; readRows_('Uploads').forEach(u => set[u.statementMonth]=true); set[monthKey_(new Date())]=true; return Object.keys(set).sort().reverse(); }
function digestHex_(bytes) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join(''); }
function newId_(prefix) { return prefix + '_' + Utilities.getUuid().replace(/-/g,''); }
function iso_() { return new Date().toISOString(); }
function userError_(message) { const e = new Error(message); e.isUserFacing = true; return e; }
function asArray_(value) { return Array.isArray(value) ? value : []; }
function safeEmployee_(r) { return { employeeId:r.employeeId, firstName:r.firstName, isActive:r.isActive, createdAt:r.createdAt, updatedAt:r.updatedAt }; }
function safeExpense_(r) { return { expenseId:r.expenseId, statementMonth:r.statementMonth, employeeId:r.employeeId, employeeNameRaw:r.employeeNameRaw, expenseDate:r.expenseDate, description:r.description, suggestedCategory:r.suggestedCategory, confidence:Number(r.confidence||0), selectedCategory:r.selectedCategory, status:r.status }; }
function matchEmployee_(raw, employees) { const n = normalizeName_(String(raw).split(' ')[0]); return employees.find(e => e.normalizedFirstName === n && String(e.isActive)==='true') || null; }
function similarity_(a,b) { const A = new Set(String(a).split(' ').filter(Boolean)), B = new Set(String(b).split(' ').filter(Boolean)); if (!A.size || !B.size) return 0; let inter=0; A.forEach(x=>{if(B.has(x)) inter++;}); return inter / Math.max(A.size, B.size); }
function audit_(action, actor, actorType, details) { try { appendRow_('AuditLog', { auditId:newId_('aud'), action, actor, actorType, details:JSON.stringify(details||{}), createdAt:iso_() }); } catch(e) {} }
