import { expect, test } from "@playwright/test";

test("la cáscara arranca y muestra login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Monitor técnico|Technical Monitor/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();
});

test("el selector de idioma cambia el copy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Technical Monitor" })).toBeVisible();
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByRole("heading", { name: "Monitor técnico" })).toBeVisible();
});
