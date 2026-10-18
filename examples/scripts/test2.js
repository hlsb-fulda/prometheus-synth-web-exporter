step("my_success", async (page) => {
  await page.goto("https://myapp.test/", { timeout: 10000 });
});

step("my_failure", async (page) => {
  throw new Error("Something went wrong");
});

step("my_skipped", async (page) => {
  // This step is never executed, because the previous one failed.
});
