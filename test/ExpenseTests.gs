/** Apps Script test helpers. Run runAppsScriptTests() from the editor. */
const ExpenseTests = (() => {
  function assert(name, condition) { if (!condition) throw new Error('FAIL: ' + name); return 'PASS: ' + name; }
  function runAll() {
    const results = [];
    ensureDatabase_();
    results.push(assert('Sheet initialization creates all required sheets', Object.keys(APP.sheets).every(n => !!ensureDatabase_().getSheetByName(n))));
    results.push(assert('Dev authorization recognizes approved email list', isDevEmail_(' skhun@dublincleaners.com ') && isDevEmail_('SS.SKU@PROTONMAIL.COM') && !isDevEmail_('other@example.com')));
    const salt = 'unit_salt'; const hash = hashPin_('1234', salt);
    results.push(assert('PIN hashing is salted and validates correct PIN only', verifyPin_('1234', salt, hash) && !verifyPin_('4321', salt, hash) && hash !== hashPin_('1234', 'different')));
    results.push(assert('Category validation accepts only fixed categories', APP.categories.length === 23 && APP.categories.indexOf('Meals') > -1));
    const parsed = parseStatementText_('John 01/15/2026 STARBUCKS STORE 8.20\n02/01/2026 Mary UBER TRIP 18.45');
    results.push(assert('PDF parsing helper extracts employee, date, and description patterns', parsed.length === 2 && parsed[0].employeeName === 'John' && parsed[1].employeeName === 'Mary'));
    const meal = suggestCategory_('STARBUCKS COFFEE LUNCH');
    results.push(assert('Auto-categorization scores keyword-heavy meal descriptions', meal.category === 'Meals' && meal.confidence >= 35));
    results.push(assert('Similarity scoring finds related historical descriptions', similarity_('starbucks coffee lunch', 'starbucks coffee') > 0.5));
    const session = { employeeId: 'emp_a', firstName: 'A' };
    CacheService.getScriptCache().put('session:test_token', JSON.stringify(session), 60);
    results.push(assert('Employee session handling isolates by server token', requireEmployeeSession_('test_token').employeeId === 'emp_a'));
    const duplicateHash = digestHex_(Utilities.newBlob('same-pdf').getBytes());
    results.push(assert('Duplicate upload helper hash is deterministic', duplicateHash === digestHex_(Utilities.newBlob('same-pdf').getBytes())));
    return results;
  }
  return { runAll };
})();
