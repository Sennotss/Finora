import { expect, test } from "@playwright/test";

test("unauthenticated visitors are sent to login", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login/);
  const res = await page.request.get("/api/transactions");
  expect(res.status()).toBe(401);
});

test("register, create an account, record transactions and see them reflected", async ({ page }) => {
  const email = `e2e-${Date.now()}@finora.test`;

  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Secret123");
  await page.getByLabel("Confirm password").fill("Secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/overview/);
  await expect(page.getByText("Add your first account")).toBeVisible();

  // Create a bank account.
  await page.getByRole("link", { name: "Create an account" }).click();
  const accountDialog = page.getByRole("dialog");
  await accountDialog.getByLabel("Account name").fill("Main Bank");
  await accountDialog.getByLabel("Opening balance").fill("1000000");
  await accountDialog.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("link", { name: /Main Bank/ })).toBeVisible();

  // Record income via the global quick-add dialog.
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Income" }).click();
  await dialog.getByLabel("Amount").fill("5000000");
  await dialog.getByLabel("Description").fill("Salary");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();

  // Record an expense.
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("250000");
  await dialog.getByLabel("Description").fill("Groceries at Superindo");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();

  // Balance = 1,000,000 + 5,000,000 − 250,000.
  await page.goto("/accounts");
  await expect(page.getByText("Rp 5.750.000").first()).toBeVisible();

  await page.goto("/transactions");
  await expect(page.getByRole("button", { name: /Groceries at Superindo/ }).first()).toBeVisible();
  await page.getByLabel("Search transactions").fill("salary");
  await expect(page).toHaveURL(/q=salary/);
  await expect(page.getByText("Groceries at Superindo")).toHaveCount(0);

  await page.goto("/overview");
  await expect(page.getByText("Rp 5.000.000").first()).toBeVisible();
  // (5,000,000 − 250,000) ÷ 5,000,000 = 95%
  await expect(page.getByText("Your saving rate is 95% for this month.")).toBeVisible();
});
