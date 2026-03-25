# WotR Companion

A companion app for **Pathfinder: Wrath of the Righteous** that reads your save files live and provides party analysis, spell planning, BubbleBuffs integration, build planning, and an AI advisor.

## Prerequisites

- [Bun](https://bun.sh) runtime (`winget install Oven-sh.Bun` or `scoop install bun`)
- Pathfinder: Wrath of the Righteous installed (Steam or GoG)
- An [Anthropic API key](https://console.anthropic.com/settings/keys) for the AI Advisor (optional — rest of the app works without it)

## Setup

### 1. Install dependencies

```sh
bun install
```

### 2. Configure environment

```sh
copy .env.example .env
```

Open `.env` and fill in your values:

```sh
# Required for AI Advisor
ANTHROPIC_API_KEY=sk-ant-...

# Only needed if your game is NOT at the default Steam path:
# A:\SteamGames\steamapps\common\Pathfinder Second Adventure
WOTR_GAME_DIR=C:\Path\To\Your\Game

# Only needed if your saves are NOT in %APPDATA%\..\LocalLow\Owlcat Games\...
WOTR_SAVES_DIR=C:\Path\To\Your\Saves
```

### 3. Build the blueprint index (one-time)

This reads your game files and builds a local database of ~250k blueprint GUIDs (spells, feats, items, classes, etc.) used to resolve names in your save files. Takes about 30 seconds.

```sh
bun run index
```

Re-run this if you install or update mods.

## Running

### Development (recommended)

Starts the API server and the Vite frontend together:

```sh
bun run dev:all
```

Then open **http://localhost:5173**

### Production

```sh
bun run build:client   # build frontend once
bun run start          # serve everything on http://localhost:3000
```

## Features

### Dashboard
Overview of your current save: party members, spell slots remaining, and party coverage (AOE buffs, healing, crowd control, etc.).

### Characters
Detailed character sheet for each party member: ability scores, combat stats, saving throws, skills, equipment, class features, feats, and spellbook summary.

### Spell Planner
Per-caster view of all known spells by level, showing what's currently prepared vs. not prepared.

### Party Analysis
Automated analysis of your party's combat readiness: which buffs/heals/CC each character has available, what's known but not prepared today, and overall party coverage gaps.

### BubbleBuffs
Requires the [BubbleBuffs mod](https://www.nexusmods.com/pathfinderwrathoftherighteous/mods/195). Shows your current BubbleBuffs configuration, diffs it against the available pre-combat buff spells in your party, and recommends what to add (with priority group and target suggestions).

### Build Planner
Define a build goal for each character — role, class/archetype path, mythic path, and free-text notes. The app then analyzes the character against that goal and shows:

- **Alignment score** (0–100) across stats, feats, spells, and equipment
- **Stat warnings** — is the primary stat for the role high enough?
- **Feat gaps** — which core feats for the role are missing, and by what level they should ideally be taken
- **Spell priorities** — which spells to prepare or add to the spellbook
- **Equipment notes** — role-specific gear checks
- **Next level-up tips** — specific actionable advice for the next level

Build profiles persist in `data/builds.json` and are automatically included in AI Advisor context.

Available roles: Tank/Defender, Melee DPS, Ranged DPS, Arcane Caster, Divine Caster, Healer, Buffer/Support, Controller (CC), Summoner, Off-Support/Utility.

### AI Advisor
Chat with Claude about your party. The AI has full context of your current save data and your defined build goals, and can look up Pathfinder 1e rules from [Archives of Nethys](https://www.aonprd.com) in real time.

**Slash commands:**

| Command | Description |
|---|---|
| `/buffs` | Available buffs and prep recommendations |
| `/combat` | Combat tips for your party composition |
| `/next-level` | Level-up recommendations for each character |
| `/party` | Full party composition analysis |

## Troubleshooting

**"Blueprint index not built"** — Run `bun run index`. Make sure `WOTR_GAME_DIR` points to your game installation.

**"AI Advisor will not work"** — Add `ANTHROPIC_API_KEY` to your `.env` file.

**"No save found"** — The app looks in `%LOCALAPPDATA%\..\LocalLow\Owlcat Games\Pathfinder Wrath Of The Righteous\Saved Games` by default. Set `WOTR_SAVES_DIR` in `.env` if your saves are elsewhere.

**Save data not refreshing** — The app watches your saves directory for changes and updates automatically. If it's stale, click the ↻ Refresh button on the Dashboard.

**BubbleBuffs shows "config not found"** — Make sure `WOTR_GAME_DIR` is set correctly. The config is read from `{GAME_DIR}/Mods/BubbleBuffs/UserSettings/`.
