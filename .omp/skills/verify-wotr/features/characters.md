# Character sheets

The Characters page lists party members, then companions `At Camp`. Picking one shows that character's sheet: HP, ability scores, class and archetype, equipment, feats and abilities by level, and a spellbook summary for casters.

## Sub-features

- `char-pick`: selector buttons under `Party` and `At Camp`.
- `char-stats`: `Hit Points`, and `Ability Scores` STR/DEX/CON/INT/WIS/CHA with modifiers and tooltips.
- `char-feats`: the feat and ability list (`Feat / ability (character level acquired)`), first 12 then expandable.
- `char-spellbook`: the `Spellbook` card showing `<type> caster · level N` and `N spells known across M levels`.

## How to get to it (user POV)

- Choose `Characters` in the sidebar, then a name in the left column.

## Driving it with wotr-verify

Preconditions:

- `wotr-verify doctor` is healthy.
- The save has at least one in-party character. The recipe uses the second one when there is one.

- **Open page.** Run `wotr-verify drive characters`. The driver clicks the nav button `Characters`.
- **Pick character.** It clicks `getByRole("button", { name: /^<inParty[1].name>/ })` (`Lann` in the current fixture).
- **Sheet shown.** It asserts `Ability Scores`, `Hit Points` and the character's `class.className` from `api-party.json`. Screenshot: `01-character-sheet.png`.

## Gotchas

- The first character is selected by default, so clicking it changes nothing visible. The recipe picks the second to prove that selection works.
- A name prefix can match two buttons (for example a companion and a pet with the same prefix). The driver takes `.first()`. Check the screenshot when a name is ambiguous.
- Unresolved blueprint GUIDs show raw names. Run `doctor` first: `indexed:false` turns every name check into a false failure.
