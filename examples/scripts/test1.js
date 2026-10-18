step("load", async (page) => {
  // Use the injected playwright page for tests
  await page.goto("https://myapp.test/", { timeout: 10000 });
});

step("login-call", async (page) => {
  // The page state is kept between steps.
  // Per-action timeouts belong on the action (locator() has no timeout option).
  await page.locator("a.btn[href*='/login']").click({ timeout: 5000 });
});

step("login-exec", async (page) => {
  // Settings are injected as global variables
  await page.locator("input#username").fill(username);
  await page.locator("input#password").fill(password);
  await page.locator("button[type=submit]").click();
});

step("login-success", async (page) => {
  // Use playwright's expect function to assert page content
  await expect(page.locator("body")).toContainText("Login successful");
});
