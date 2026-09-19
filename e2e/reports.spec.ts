import { test, expect } from '@playwright/test';

test.describe('Reports', () => {
  test('balance sheet page loads with period selector', async ({ page }) => {
    await page.goto('/reports/balance-sheet');
    await expect(page.getByRole('heading', { name: 'Tase' })).toBeVisible();
  });

  test('income statement page loads', async ({ page }) => {
    await page.goto('/reports/income-statement');
    await expect(
      page.getByRole('heading', { name: 'Tuloslaskelma' }),
    ).toBeVisible();
  });

  test('VAT report page loads', async ({ page }) => {
    await page.goto('/vat');
    await expect(
      page.getByRole('heading', { name: 'Arvonlisävero' }),
    ).toBeVisible();
  });

  test('financialStatement page loads', async ({ page }) => {
    await page.goto('/reports/financial-statement');
    await expect(
      page.getByRole('heading', { name: /Tilinpäätös/i }),
    ).toBeVisible();
  });

  test('documents page allows navigating to new document form', async ({
    page,
  }) => {
    await page.goto('/documents');
    const newDocLink = page.getByRole('link', { name: /Uusi tosite/i });
    await expect(newDocLink).toBeVisible();
    await newDocLink.click();
    await expect(
      page.getByRole('heading', { name: /Uusi tosite/i }),
    ).toBeVisible();
    await expect(page.getByText('Tallenna')).toBeVisible();
  });
});
