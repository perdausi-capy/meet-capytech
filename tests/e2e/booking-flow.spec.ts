import { test, expect } from '@playwright/test';

test.describe('Guest Booking & Manage UI E2E Flow', () => {
  test('displays available slots and allows navigating booking interface', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Meet with');
    await expect(page.getByRole('radiogroup', { name: 'Meeting type' })).toBeVisible();
  });

  test('manage page renders booking details properly', async ({ page, request }) => {
    const testDate = '2026-11-25';

    // 1. Dynamically fetch a guaranteed vacant slot
    const slotsRes = await request.get(`/api/slots?date=${testDate}&type=intro`);
    expect(slotsRes.status()).toBe(200);
    const slotsData = await slotsRes.json();
    expect(slotsData.slots.length).toBeGreaterThan(0);
    const vacantSlot = slotsData.slots[0].startsAt;

    // 2. Create booking for the open slot
    const res = await request.post('/api/bookings', {
      data: {
        meetingType: 'intro',
        date: testDate,
        startTime: vacantSlot,
        name: 'E2E Tester',
        email: 'e2e@capytech.com',
        notes: 'Playwright test run',
      },
    });

    expect(res.status()).toBe(201);
    const data = await res.json();
    const token = data.manageToken;

    // 3. Open Manage UI in the browser
    await page.goto(`/manage/${token}`);

    // 4. Verify UI components
    await expect(page.locator('h1')).toContainText('here’s your meeting');
    await expect(page.locator('h1')).toContainText('Hi E2E');
    await expect(page.getByRole('button', { name: 'Reschedule' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel meeting' })).toBeVisible();
  });
});
