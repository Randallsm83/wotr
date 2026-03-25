# App Flows — WotR Companion UX Audit Reference

Audit flows in this order. Navigation is via the left sidebar — there is no URL routing.
All pages are accessible from the sidebar at http://localhost:5173.

---

## 0. Error State — No Save File

**Scenario:** App starts with no valid save found (file missing, wrong `WOTR_SAVES_DIR`).

Steps:
- Load the app cold
- Observe what each page renders without save data
- Click the ↻ Refresh button on the Dashboard if visible

Watch for:
- Is it clear why there's no data — and what the user needs to do?
- Does the error message reference `WOTR_SAVES_DIR` or give a path to check?
- Do all pages degrade gracefully or do some crash/hang?
- Is the Refresh button visible and labeled clearly?
- Does the sidebar show "Live save connected" or nothing when no save is loaded?

---

## 1. Initial Load + Live Save Indicator

**Entry:** http://localhost:5173 (cold load)

Steps:
- Observe the sidebar — specifically the footer status indicator
- Load a save and observe the indicator change to `● Live save connected`
- Save the game from WotR and observe the update propagate to the app

Watch for:
- Is the sidebar "WotR / Companion" header clear enough as an app identity?
- Is the live save indicator visible and meaningful — or does it look like decoration?
- When a save update fires, is there visible feedback (spinner, flash, badge)?
- Is there any loading state while the initial save is parsed?
- Are icon-only nav items (`⚔ ▦ ✦ ⊞ ◎ ◉ ⌸ ◈`) meaningful, or just decorative?

---

## 2. Dashboard

**Entry:** Click "Dashboard" (⚔) in the sidebar

Steps:
- Observe the party overview at a glance
- Note the spell slots remaining display per caster
- Note the party coverage section (AOE buffs, healing, crowd control, etc.)
- Click ↻ Refresh and observe behavior
- Check what shows when a character has 0 spells remaining vs. full slots

Watch for:
- Can a player answer "is my party ready?" from this page alone?
- Are spell slot counts labeled with the caster's name and class clearly?
- Are coverage categories (AOE, healing, CC) explained or just listed?
- Is "CC" defined anywhere, or assumed knowledge?
- Is the Refresh button obvious — and does it show a loading state?
- If party coverage is partial (e.g. no dedicated healer), is the gap flagged visibly?
- Is the data stale indicator (time since last update) shown?

---

## 3. Characters

**Entry:** Click "Characters" (▦) in the sidebar

Steps:
- Observe the character list/selector
- Select one character and read through their sheet
- Check ability scores, combat stats, saving throws, skills
- Scroll to equipment section — inspect what's shown
- Scroll to feats and class features
- Scroll to spellbook summary
- Switch to another character

Watch for:
- Is character selection obvious (tabs, dropdown, list)?
- Are ability score modifiers shown alongside raw scores?
- Are combat stats (AC, CMD, CMB, BAB, attack bonus) clearly labeled — not just raw numbers?
- Are saving throws labeled Fort/Ref/Will or just numbers?
- Is equipment shown with slot labels (Primary Hand, Armor, Ring 1, etc.)?
- Are feat names truncated or wrapped at narrow width?
- Is the spellbook summary meaningful for a non-caster character?
- After switching characters, does scroll position reset?

---

## 4. Spell Planner

**Entry:** Click "Spell Planner" (✦) in the sidebar

Steps:
- Observe the caster selector
- Walk through each spell level for a full caster (Nenio or Ember)
- Note which spells are marked "prepared" vs. known but not prepared
- Switch to a non-caster character

Watch for:
- Is the caster selector clear — does it list only casters or all party members?
- Are spell levels grouped and labeled (Level 0 / Cantrips, Level 1, Level 2, …)?
- Is the prepared vs. known distinction visually obvious (color, icon, label)?
- For a non-caster, does the page show an appropriate empty state?
- Are spell names that are long truncated cleanly?
- Is there any way to see slot availability (slots used / slots total) per level?

---

## 5. Party Analysis

**Entry:** Click "Party Analysis" (⊞) in the sidebar

Steps:
- Read the analysis overview
- Find any character listed as "known but not prepared" for key buffs
- Find any party-wide coverage gaps listed
- Note how the analysis handles a party with varied classes

Watch for:
- Is the analysis organized clearly — by character, by buff type, or by priority?
- Does "known but not prepared" get called out prominently, not buried?
- Are buff names (Haste, Heroism, Prayer, etc.) expected to be recognized — or explained?
- Is "overall party coverage" meaningful — can a player act on it?
- Are gaps vs. strengths visually differentiated?
- Does the page explain what "combat readiness" means in this context?

---

## 6. BubbleBuffs

**Entry:** Click "BubbleBuffs" (◎) in the sidebar

Steps:
- Observe the page when BubbleBuffs mod is NOT installed — check the error state
- If mod is available: observe the diff view (current config vs. recommended)
- Review a missing buff recommendation — check priority group and target labels
- Click "Add" on a recommended buff
- Observe the change reflected in the config diff

Watch for:
- Is there an explanation of what BubbleBuffs is for a user who hasn't heard of it?
- Is "config not found" error specific about what `WOTR_GAME_DIR` should be set to?
- Are priority groups (1–4) explained? What does priority 1 vs. 4 mean?
- Is the "target" field (Self, All, Party) labeled clearly?
- After adding a buff, is there confirmation feedback?
- Is the warning "do not write while the game is running" surfaced in the UI?

---

## 7. Build Planner

**Entry:** Click "Build Planner" (◉) in the sidebar

Steps:
- Select a character
- Observe the AI analysis panel that loads immediately
- Set a role for the character from the role dropdown
- Set a class/archetype path (free text)
- Set a mythic path
- Add free-text notes
- Observe how the alignment score (0–100) updates
- Check the Stat Warnings section
- Check the Feat Gaps section
- Check the Spell Priorities section
- Check the Equipment Notes section
- Check Next Level-Up Tips
- Switch to another character — observe `AiStream` reset

Watch for:
- Is the role dropdown self-explanatory? Does "Controller (CC)" or "Off-Support/Utility" make sense?
- Is the alignment score (0–100) explained — what does 0 mean vs. 100?
- Are feat gap recommendations actionable — do they name the feat and say by what level?
- Is the AI streaming panel clearly labeled as AI-generated vs. rule-based?
- When switching characters, does the AI panel reset cleanly (no stale content flash)?
- Are "Next Level-Up Tips" specific enough to be actionable?
- Is the build profile saved automatically, or is there a Save button?

---

## 8. Party Builder

**Entry:** Click "Party Builder" (⌸) in the sidebar

Steps:
- Read the party composition overview
- Check each character's role scores across the six axes
- Note any roles flagged as "gaps" (score ≤ 1)
- Note any roles flagged as "strengths" (score ≥ 4)
- Check synergy suggestions

Watch for:
- Are the six scoring axes (Frontline, Damage, Healer, Buffer, Control, Utility) self-explanatory?
- Is the score scale (0–5) labeled or just implied?
- Are "gaps" visually alarming enough — red, icon, prominently placed?
- Are "synergies" explained or just listed as character names?
- Is it obvious that this page shows the whole party at once vs. per-character?
- Does the advice section give specific, actionable next steps?

---

## 9. AI Advisor (Chat)

**Entry:** Click "AI Advisor" (◈) in the sidebar

Steps:
- Observe the initial chat state
- Look for slash command hints — are `/buffs`, `/combat`, `/next-level`, `/party` discoverable?
- Type `/party` and send — observe the streaming response
- Watch for "Searching AoN…" tool use indicator mid-response
- Ask a free-form question ("Should I use Haste or Heroism before a boss fight?")
- Observe if the app has no API key set — check the error state

Watch for:
- Is there a placeholder, hint text, or slash command menu that surfaces the available commands?
- Is the streaming text response smooth, or does it appear in jarring chunks?
- Is the "Searching AoN…" tool use indicator visible and clearly labeled?
- Does the AI response include markdown that renders correctly (bold, lists)?
- Is it clear the AI has context of the current save — or does it feel generic?
- With no API key: is the error message specific ("Add ANTHROPIC_API_KEY to .env") or vague?
- Is there a loading/spinner state while the first response streams in?

---

## 10. Navigation & Cross-Cutting

Steps:
- Click every nav item back and forth rapidly — check for state bleed or crashes
- Note whether selected state in sidebar is always correct
- Try resizing the browser to 1280×800 (narrow laptop)
- Check if any page content overflows the viewport

Watch for:
- Does the active nav item always reflect the current page?
- Is text truncated or misaligned on narrower viewports?
- Is the sidebar always visible, or does it collapse at narrow widths?
- Are any interactive elements too small to target reliably (below 32px touch target)?
- Is the spaceduck dark theme readable throughout — no low-contrast text?
