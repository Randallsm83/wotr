#!/usr/bin/env bun
// Drives one WotR Companion feature in headless Chrome like a user and writes evidence.
// Usage (via wotr-verify drive <feature>): bun drive.ts <feature> <baseUrl> <outDir>
// Run with cwd = harness dir that has playwright-core installed.
import { createRequire } from "module";
import { join } from "path";
import { writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import type { ConsoleMessage, Response } from "playwright-core";

// Only the /api/party fields this driver reads (src/server/models/types.ts).
type Spell = { name: string; displayName: string };
type Char = { uniqueId: string; name: string; inParty: boolean; class?: { className: string }; spellbook?: { knownSpells: Spell[][] } };
type Party = { meta: { playerCharacterName: string }; characters: Char[] };

const [feature, base, out] = process.argv.slice(2);
if (!feature || !base || !out) throw new Error("usage: drive.ts <feature> <baseUrl> <outDir>");
const { chromium } = createRequire(join(process.cwd(), "package.json"))("playwright-core");

const log: { step: string; detail?: unknown }[] = [];
const step = (s: string, detail?: unknown) => { log.push({ step: s, detail }); console.log(`- ${s}`); };
const api = async <T>(p: string): Promise<T> => {
  const r = await fetch(base + p);
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`);
  return r.json();
};
const save = (name: string, data: unknown) =>
  writeFileSync(join(out, name), typeof data === "string" ? data : JSON.stringify(data, null, 2));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const consoleErrors: string[] = [];
page.on("console", (m: ConsoleMessage) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e: Error) => consoleErrors.push(String(e)));

async function shot(name: string) {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  save(`${name}.aria.yml`, await page.locator("body").ariaSnapshot());
}
const nav = (label: string) => page.getByRole("navigation").getByRole("button", { name: label });
const expectText = async (text: string) => {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 15000 });
  step(`visible: ${text}`);
};

let status = "pass";
let failure: string | undefined;
try {
  const party = await api<Party>("/api/party");
  save("api-party.json", party);
  const inParty = party.characters.filter((c) => c.inParty);

  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "WotR Companion" }).waitFor({ timeout: 20000 });
  step("app loaded", { url: page.url() });

  if (feature === "dashboard") {
    await expectText(`Player: ${party.meta.playerCharacterName}`);
    await expectText(`Active Party (${inParty.length})`);
    for (const c of inParty) await expectText(c.name);
    await shot("01-dashboard");
    const [resp] = await Promise.all([
      page.waitForResponse((r: Response) => r.url().endsWith("/api/party")),
      page.getByRole("button", { name: "↻ Refresh" }).click(),
    ]);
    step("clicked ↻ Refresh", { status: resp.status() });
    if (resp.status() !== 200) throw new Error(`refresh /api/party -> ${resp.status()}`);
    await expectText(`Active Party (${inParty.length})`);
    await expectText("Live save connected");
    await shot("02-dashboard-after-refresh");
  } else if (feature === "characters") {
    await nav("Characters").click();
    step("nav: Characters");
    const target = inParty[1] ?? inParty[0];
    await page.getByRole("button", { name: new RegExp(`^${target.name}`) }).first().click();
    step(`selected ${target.name}`);
    await expectText("Ability Scores");
    await expectText("Hit Points");
    if (target.class) await expectText(target.class.className);
    await shot("01-character-sheet");
  } else if (feature === "spells") {
    await nav("Spell Planner").click();
    await page.getByRole("heading", { name: "Spell Planner" }).waitFor();
    step("nav: Spell Planner");
    const casters = [...party.characters.filter((c) => c.spellbook && c.inParty), ...party.characters.filter((c) => c.spellbook && !c.inParty)];
    if (casters.length === 0) throw new Error("save has no spellcasters");
    const target = casters[Math.min(1, casters.length - 1)];
    if (casters.length > 1) {
      await page.getByRole("button", { name: new RegExp(`^${target.name}`) }).first().click();
      step(`selected caster ${target.name}`);
    }
    const spell = target.spellbook!.knownSpells.flat().find((s) => s.displayName || s.name);
    if (!spell) throw new Error(`${target.name} has no known spells`);
    await expectText(spell.displayName || spell.name);
    await shot("01-spell-planner");
  } else if (feature === "builds") {
    const before = await api<{ characterId: string }[]>("/api/builds");
    save("api-builds-before.json", before);
    await nav("Build Planner").click();
    step("nav: Build Planner");
    const target = inParty[0];
    await page.getByRole("button", { name: new RegExp(`^${target.name}`) }).first().click();
    await expectText("Build Profile");
    await shot("01-build-planner");
    const [resp] = await Promise.all([
      page.waitForResponse((r: Response) => r.request().method() === "PUT" && r.url().includes("/api/builds/")),
      page.getByRole("button", { name: "Save Build" }).click(),
    ]);
    step("clicked Save Build", { status: resp.status(), url: resp.url() });
    if (resp.status() !== 200) throw new Error(`PUT builds -> ${resp.status()}`);
    const after = await api<{ characterId: string }[]>("/api/builds");
    save("api-builds-after.json", after);
    if (!after.some((b) => b.characterId === target.uniqueId)) throw new Error("saved profile missing from GET /api/builds");
    step("GET /api/builds contains profile", { characterId: target.uniqueId });
    const store = join(process.env.WOTR_VERIFY_APP_DIR!, "data", "builds.json");
    save("side-effect-builds.json", readFileSync(store, "utf8"));
    step("data/builds.json in snapshot written", { store });
    await shot("02-build-saved");
  } else if (feature === "bubbles") {
    const gameDir = process.env.WOTR_VERIFY_GAME_DIR!;
    await nav("BubbleBuffs").click();
    step("nav: BubbleBuffs");
    const notConfigured = page.getByText("BubbleBuffs Not Configured");
    await Promise.race([notConfigured.waitFor(), page.getByRole("heading", { name: "BubbleBuffs" }).waitFor()]);
    await shot("01-bubblebuffs");
    if (await notConfigured.isVisible()) throw new Error(`precondition: no buff-mod config under ${gameDir}/Mods/*/UserSettings`);
    const cfgFiles = ["BuffIt2TheLimit", "BubbleBuffs"].flatMap((m) => {
      const d = join(gameDir, "Mods", m, "UserSettings");
      return existsSync(d) ? readdirSync(d).map((f) => join(d, f)) : [];
    });
    const beforeCfg = Object.fromEntries(cfgFiles.map((f) => [f, readFileSync(f, "utf8")]));
    const add = page.getByRole("button", { name: "+ Add" }).first();
    await add.click();
    await page.getByRole("button", { name: "✓ Added" }).first().waitFor({ timeout: 15000 });
    step("clicked + Add -> ✓ Added");
    const changed = cfgFiles.filter((f) => readFileSync(f, "utf8") !== beforeCfg[f]);
    if (changed.length === 0) throw new Error("✓ Added shown but no config file changed");
    step("config written", changed);
    await shot("02-bubblebuffs-added");
  } else {
    throw new Error(`unknown feature ${feature}`);
  }
} catch (e) {
  status = "fail";
  failure = e instanceof Error ? e.message : String(e);
  step(`FAIL: ${failure}`);
  await shot("zz-failure").catch(() => {});
} finally {
  save("result.json", { feature, base, status, failure, consoleErrors, steps: log, at: new Date().toISOString() });
  await browser.close();
}
console.log(`${feature}: ${status.toUpperCase()}${failure ? ` (${failure})` : ""}`);
process.exit(status === "pass" ? 0 : 1);
