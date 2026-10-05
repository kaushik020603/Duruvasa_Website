import { expect, test } from "@playwright/test";
import { adminLogin, adminSetup, skipIntro } from "./helpers";

// These tests share one database and build on each other, so they run in order.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => { await skipIntro(page); });

test("the admin is locked until you sign in", async ({ page, request }) => {
  expect((await request.get("/api/admin/enquiries")).status()).toBe(401);
  await page.goto("/admin/#/content/hero");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("first-run setup enforces a strong password, then signs in", async ({ page }) => {
  const { freshSetupLink } = await import("./helpers");
  await page.goto(freshSetupLink());
  await page.getByLabel("New password").fill("short");
  await expect(page.getByRole("button", { name: "Set password and sign in" })).toBeDisabled();
  await page.close();
});

test("complete setup and see the dashboard", async ({ page }) => {
  await adminSetup(page);
  await expect(page.getByText("Protect this account with two-factor authentication")).toBeVisible();
});

test("an enquiry sent from the website appears in the admin and can be worked", async ({ page, request }) => {
  const sent = await request.post("/api/enquiries", {
    data: { type: "consultation", first: "Anita", last: "Desai", email: "anita.e2e@example.com", phone: "+91 91234 56789", message: "E2E consultation about SOC monitoring.", preferredTime: "Wed 8 Oct at 11:00", elapsed: 9000 },
  });
  expect(sent.status()).toBe(201);
  await adminLogin(page);
  await page.getByRole("link", { name: /Enquiries/ }).first().click();
  const row = page.getByRole("row", { name: /Anita Desai/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Consultation");
  await row.click();
  const drawer = page.getByRole("dialog", { name: "Anita Desai" });
  await expect(drawer.getByText("Wed 8 Oct at 11:00")).toBeVisible();
  await drawer.getByRole("button", { name: "In progress" }).click();
  await drawer.getByPlaceholder(/Only visible to admins/).fill("Called, booked for Wednesday.");
  await drawer.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes saved")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /In progress/ }).first().click();
  await expect(page.getByRole("row", { name: /Anita Desai/ })).toContainText("In progress");
});

test("editing the hero in the CMS changes the public website", async ({ page, context }) => {
  await adminLogin(page);
  await page.goto("/admin/#/content/hero");
  const line = page.getByLabel(/Headline, line 1/);
  await expect(line).toHaveValue("Protecting Your");
  await line.fill("Defending Your");
  await expect(page.getByText("You have unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Saved\. The website is updated/).first()).toBeVisible();
  const pub = await context.newPage();
  await skipIntro(pub);
  await pub.goto("/");
  await expect(pub.locator("h1")).toContainText("Defending Your");

  // Put it back so the suite is repeatable.
  await line.fill("Protecting Your");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Saved\. The website is updated/).first()).toBeVisible();
});

test("validation blocks unsafe partner links", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/#/content/partners/new");
  await page.getByLabel(/^Name/).fill("Evil Corp");
  await page.getByLabel(/^Logo/).fill("/img/p-dc.webp");
  await page.getByLabel(/^Website/).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/must be a web address/)).toBeVisible();
});

test("add, hide and delete a partner; the public carousel follows", async ({ page, context }) => {
  await adminLogin(page);
  await page.goto("/admin/#/content/partners/new");
  await page.getByLabel(/^Name/).fill("Acme E2E");
  await page.getByLabel(/^Logo/).fill("/img/p-dc.webp");
  await page.getByLabel(/^Website/).fill("https://acme.example");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Created")).toBeVisible();

  const pub = await context.newPage();
  await skipIntro(pub);
  await pub.goto("/");
  await expect(pub.locator(".partner-card-link:not([aria-hidden])")).toHaveCount(7);

  await page.goto("/admin/#/content/partners");
  await page.getByRole("switch", { name: "Publish Acme E2E" }).click();
  await pub.reload();
  await expect(pub.locator(".partner-card-link:not([aria-hidden])")).toHaveCount(6);

  await page.getByRole("row", { name: /Acme E2E/ }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("row", { name: /Acme E2E/ })).toHaveCount(0);
});

test("the checklist signup lands in Subscribers, and the CSV export is protected", async ({ page, request }) => {
  await adminLogin(page);
  await page.getByRole("link", { name: "Subscribers", exact: true }).click();
  await expect(page.getByRole("link", { name: "lead.e2e@example.com" })).toBeVisible();
  expect((await request.get("/api/admin/subscribers/export.csv")).status()).toBe(401); // no session cookie on this request context
});

test("two-factor authentication can be turned on from My security", async ({ page }) => {
  await adminLogin(page);
  await page.getByRole("link", { name: "My security" }).click();
  await page.getByRole("button", { name: "Set up 2FA" }).click();
  await expect(page.getByAltText(/QR code/)).toBeVisible();
  await expect(page.getByText(/Enter this key manually/)).toBeVisible();
});

test("sign out ends the session", async ({ page }) => {
  await adminLogin(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto("/admin/#/enquiries");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("forgot password: change it from the sign-in page with the old password", async ({ page }) => {
  const NEW = "A-Different-Passphrase-77#";
  await page.goto("/admin/");
  await page.getByRole("button", { name: /Forgot or want to change your password/ }).click();
  await page.getByLabel("Email").fill("rajesh@duruvasa.com");
  await page.getByLabel("Current (old) password").fill("wrong-old-password-1A!");
  await page.getByLabel("New password", { exact: true }).fill(NEW);
  await page.getByLabel("Repeat new password").fill(NEW);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect email, password or code");

  await page.getByLabel("Current (old) password").fill("E2e-Throwaway-Passphrase-42!");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();
  await page.getByRole("button", { name: "Go to sign in" }).click();

  await page.getByLabel("Email").fill("rajesh@duruvasa.com");
  await page.getByLabel("Password").fill("E2e-Throwaway-Passphrase-42!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect"); // old password no longer works
  await page.getByLabel("Password").fill(NEW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
});
