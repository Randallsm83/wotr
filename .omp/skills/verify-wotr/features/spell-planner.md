# Spell Planner

The Spell Planner shows every spellcaster in the save, party first and then `AT CAMP`. For the selected caster it lists remaining/total slots per level and known spells by level, with prepared spells marked. A static `Prep Priorities` card follows.

## Sub-features

- `spell-pick`: caster buttons (`<name> <class> <level>`).
- `spell-slots`: `L<n>: remaining/total` per spell level, shown in red when empty.
- `spell-known`: `Cantrips / Orisons` and `Level N` groups of known spells.
- `spell-prep`: the curated `Prep Priorities` list.

## How to get to it (user POV)

- Choose `Spell Planner` in the sidebar, then a caster button.

## Driving it with wotr-verify

Preconditions:

- `wotr-verify doctor` is healthy.
- The save has at least one character with a `spellbook`. The fixture has several, including `Nenio`.

- **Open page.** Run `wotr-verify drive spells`. The driver clicks the nav button `Spell Planner` and waits for the `Spell Planner` heading.
- **Pick caster.** It clicks the second caster in party-first order (`Nenio` in the current fixture).
- **Spells listed.** It asserts that the first known spell of that caster (`displayName`, falling back to `name`, from `api-party.json`) is visible. Screenshot: `01-spell-planner.png`.

## Gotchas

- The selector only renders with two or more casters. With one, the card shows directly and the recipe skips the click.
- `Prep Priorities` is hard-coded text (Nenio, Camellia, Daeran, Sosiel, Kaede). It does not prove anything about the save.
- Spell names come from the blueprint DB. Without it the page still renders, with raw blueprint names.
