import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

async function player(browser: Browser, viewport = { width: 1024, height: 768 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport });
  return ctx.newPage();
}
const status = (p: Page) => p.getByRole("status").first();

test("two players play, one drops offline and rejoins, a third device rejoins by link", async ({ browser }) => {
  const anna = await player(browser);
  await anna.goto("/");
  await anna.getByLabel("Your nickname").fill("Anna");
  await anna.getByRole("combobox", { name: "First player" }).click();
  await anna.getByRole("option", { name: "Me" }).click();
  await anna.getByRole("button", { name: "Create game" }).click();
  const invite = await anna.getByLabel("Send this link to your friend").inputValue();
  expect(invite).toMatch(/\/j\/[0-9A-Z]{8}$/);

  // Ben on a phone-sized screen (W-80)
  const ben = await player(browser, { width: 360, height: 640 });
  await ben.goto(invite);
  await expect(ben.getByText("Anna invites you to a game")).toBeVisible();
  await ben.getByLabel("Your nickname").fill("Ben");
  await ben.getByRole("button", { name: "Join game" }).click();

  await expect(status(anna)).toHaveText("Your turn: play a land or end the turn");
  await expect(status(ben)).toHaveText("Anna's turn");
  expect(await ben.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await anna.getByRole("button", { name: "End turn" }).click();
  await expect(status(ben)).toHaveText("Your turn: play a land or end the turn");

  // Ben's tab dies (phone locked, tab discarded): Anna sees it; Ben reopens the game from his saved session (W-05, P-06)
  const benCtx = ben.context();
  const benGame = new URL(ben.url()).pathname;
  await ben.close();
  await expect(anna.getByText("offline", { exact: true })).toBeVisible({ timeout: 15_000 });
  const ben2 = await benCtx.newPage();
  await ben2.goto(benGame);
  await expect(anna.getByText("offline", { exact: true })).toBeHidden({ timeout: 15_000 });
  await expect(status(ben2)).toHaveText("Your turn: play a land or end the turn");

  // play a land that needs no target if there is one, otherwise just end the turn
  await ben2.getByRole("button", { name: "End turn" }).click();
  await expect(status(anna)).toHaveText("Your turn: play a land or end the turn");

  // Anna continues on a second device with her rejoin link (W-13)
  const saved = await anna.evaluate(() => JSON.parse(localStorage.getItem("blg.sessions")!));
  const [gameId, s] = Object.entries(saved)[0] as [string, { token: string }];
  const phone = await player(browser);
  await phone.goto(`/g/${gameId}#t=${s.token}`);
  await expect(status(phone)).toHaveText("Your turn: play a land or end the turn");
  expect(phone.url()).not.toContain("#t=");

  // Anna concedes; Ben sees the result and both can rematch with the loser first (W-38, W-41)
  await anna.getByRole("button", { name: "Menu" }).click();
  await anna.getByRole("button", { name: "Concede" }).click();
  await anna.getByRole("button", { name: "Yes" }).click();
  await expect(ben2.getByText("You won")).toBeVisible();
  await expect(anna.getByText("You lost")).toBeVisible();
  await anna.getByRole("button", { name: "Rematch" }).click();
  await ben2.getByRole("button", { name: "Rematch" }).click();
  await expect(anna).toHaveURL(/\/g\/(?!.*#)/);
  await expect(status(anna)).toHaveText("Your turn: play a land or end the turn", { timeout: 10_000 });
});

test("an invite to a full game says so, and defaults need no Scryfall (W-14, W-63)", async ({ browser }) => {
  const requests: string[] = [];
  const a = await player(browser);
  a.on("request", (r) => requests.push(r.url()));
  await a.goto("/");
  await a.getByLabel("Your nickname").fill("Anna");
  await a.getByRole("button", { name: "Create game" }).click();
  const invite = await a.getByLabel("Send this link to your friend").inputValue();
  const b = await player(browser);
  b.on("request", (r) => requests.push(r.url()));
  await b.goto(invite);
  await b.getByLabel("Your nickname").fill("Ben");
  await b.getByRole("button", { name: "Join game" }).click();
  await expect(status(b)).toBeVisible();
  const c = await player(browser);
  await c.goto(invite);
  await expect(c.getByText("This game is full").first()).toBeVisible();
  expect(requests.filter((u) => u.includes("scryfall") || u.includes("/img/") || u.includes("/api/printings"))).toEqual([]);
  // every tile uses bundled art
  const imgs = await b.locator("img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute("src")));
  expect(imgs.every((s) => s?.startsWith("/art/default/"))).toBe(true);
});
