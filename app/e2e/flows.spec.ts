import { expect, test, type Page } from '@playwright/test';

/**
 * The acceptance scenarios from the handoff (CLAUDE.md §8.6).
 *
 * These need a real Supabase project — they check that the database refuses
 * what the interface hides, which a mocked backend could not prove. Configure:
 *
 *   E2E_BASE_URL         the running app
 *   E2E_ADMIN_PN         the administrator's personal number  (seed: 8409505)
 *   E2E_ADMIN_PIN        that account's four-digit code
 *   E2E_FIGHTER_PN       a fighter's personal number
 *   E2E_FIGHTER_PIN      that fighter's code
 *
 * Without them the suite skips rather than failing, so `npm test` stays green
 * on a machine that has no backend attached.
 */

const ADMIN_PN = process.env.E2E_ADMIN_PN;
const ADMIN_PIN = process.env.E2E_ADMIN_PIN;
const FIGHTER_PN = process.env.E2E_FIGHTER_PN;
const FIGHTER_PIN = process.env.E2E_FIGHTER_PIN;

test.skip(!ADMIN_PN || !ADMIN_PIN, 'הגדר E2E_ADMIN_PN ו-E2E_ADMIN_PIN כדי להריץ את הבדיקות');

async function login(page: Page, pn: string, pin: string) {
  await page.goto('/login');
  await page.getByPlaceholder('7 ספרות').fill(pn);
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.getByPlaceholder('••••').first().fill(pin);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page).toHaveURL(/\/schedule/);
}

test.describe('כניסה והרשאות', () => {
  test('מספר אישי שאינו רשום נדחה בהודעה ברורה', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('7 ספרות').fill('9999999');
    await page.getByRole('button', { name: 'המשך' }).click();
    await expect(page.getByRole('alert')).toContainText('לא רשום במערכת');
  });

  test('קוד שגוי אינו מכניס', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('7 ספרות').fill(ADMIN_PN!);
    await page.getByRole('button', { name: 'המשך' }).click();
    await page.getByPlaceholder('••••').first().fill('0000');
    await page.getByRole('button', { name: 'כניסה' }).click();
    await expect(page.getByRole('alert')).toContainText('קוד שגוי');
    await expect(page).toHaveURL(/\/login/);
  });

  test('מנהל רואה את לשונית הניהול; לוחם לא', async ({ page }) => {
    await login(page, ADMIN_PN!, ADMIN_PIN!);
    await expect(page.getByRole('link', { name: 'ניהול' })).toBeVisible();

    if (!FIGHTER_PN || !FIGHTER_PIN) test.skip(true, 'אין פרטי לוחם לבדיקה');
    await page.getByRole('button', { name: 'תפריט משתמש' }).click();
    await page.getByRole('button', { name: 'יציאה' }).click();
    await login(page, FIGHTER_PN!, FIGHTER_PIN!);
    await expect(page.getByRole('link', { name: 'ניהול' })).toHaveCount(0);
  });
});

test.describe('לו״ז וניהול התקופה', () => {
  test('יצירת סבב אוטומטי ממלאת את ציר התקופה', async ({ page }) => {
    await login(page, ADMIN_PN!, ADMIN_PIN!);
    await page.goto('/manage');
    await page.getByRole('button', { name: 'יצירת סבב אוטומטי' }).click();
    await expect(page.getByText(/אימונים ייווצרו/)).toBeVisible();
    await page.getByRole('button', { name: 'צור את התבנית' }).click();
    await expect(page.locator('table.table tbody tr').first()).toBeVisible();

    await page.goto('/schedule');
    await expect(page.getByText('שלב א׳', { exact: false })).toBeVisible();
  });

  test('הזזת הלו״ז מעדכנת את כל האימונים', async ({ page }) => {
    await login(page, ADMIN_PN!, ADMIN_PIN!);
    await page.goto('/manage');
    const firstDate = await page.locator('input[type="date"]').nth(1).inputValue();
    await page.getByRole('button', { name: 'הזזת כל הלו״ז' }).click();
    await page.getByRole('button', { name: 'הזז את הלו״ז' }).click();
    await expect(page.getByRole('status')).toContainText('הוזז');
    await page.reload();
    const movedDate = await page.locator('input[type="date"]').nth(1).inputValue();
    expect(movedDate).not.toBe(firstDate);
  });
});

test.describe('נוכחות', () => {
  test('לוחם מסמן נוכחות, וסיבה חובה כשלא מגיע', async ({ page }) => {
    if (!FIGHTER_PN || !FIGHTER_PIN) test.skip(true, 'אין פרטי לוחם לבדיקה');
    await login(page, FIGHTER_PN!, FIGHTER_PIN!);
    await page.goto('/my');

    await page.getByRole('button', { name: /סימון נוכחות|עדכון נוכחות/ }).first().click();
    await page.getByRole('button', { name: 'לא מגיע', exact: true }).click();
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByRole('status')).toContainText('חובה לציין סיבה');

    await page.getByPlaceholder(/מילואים/).fill('מילואים בגדוד אחר');
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByRole('status')).toContainText('נשמרה');
  });

  test('מפקד מאשר נוכחות, ומי שלא הגיב נרשם כלא מגיע', async ({ page }) => {
    await login(page, ADMIN_PN!, ADMIN_PIN!);
    await page.goto('/trainings');
    await page.locator('table.table tbody tr').first().click();
    await page.getByRole('button', { name: /^נוכחות/ }).click();
    await page.getByRole('button', { name: 'אישור סופי לכל הצוות' }).click();
    await expect(page.getByRole('status')).toContainText('אושרה');
    await expect(page.getByText('לא הגיב — נחשב לא מגיע').first()).toBeVisible();
  });
});

test.describe('הזמנות ומחליפים', () => {
  test('הזמנת מדריך נשלחת וממתינה לאישור', async ({ page }) => {
    await login(page, ADMIN_PN!, ADMIN_PIN!);
    await page.goto('/trainings');
    await page.locator('table.table tbody tr').first().click();
    await page.getByRole('button', { name: 'הזמן / החלף' }).first().click();
    await expect(page.getByText('הצעת המערכת למחליף')).toBeVisible();
    await page.getByRole('button', { name: 'שלח הזמנה' }).click();
    await expect(page.getByRole('status')).toContainText(/ההזמנה נשלחה|שובצת/);
  });
});

test.describe('מובייל', () => {
  test('סרגל התחתון מציג חמש לשוניות ואין גלילה אופקית', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'רלוונטי למכשיר נייד בלבד');
    await login(page, ADMIN_PN!, ADMIN_PIN!);
    const tabs = page.locator('nav[aria-label="ניווט ראשי"] a');
    await expect(tabs).toHaveCount(5);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
