# PTR1e AP Charges

External Foundry VTT module for Pokemon Tabletop Reunited (`ptu`). It improves Trainer Action Point visibility and adds charge tracking for Feature and Move usage.

## Features

- Replaces the Trainer sheet AP range with a segmented AP meter.
- Reads active `AP-Bind-X` and `AP-Drain-X` keywords from owned items, features, moves, abilities, and effects.
- Also respects PTR1e native `ActionPoint` Rule Elements when present.
- AP segment colors:
  - Green: currently available AP.
  - Grey: spent usable AP.
  - Yellow: AP Bind.
  - Red: AP Drain.
- Adds AP text under the meter: `Bind: X | Drain: Y`.
- Adds a tooltip: `Available: X / Bind: Y / Drain: Z / Maximum: N`.
- Warns and clamps AP values that exceed usable AP after Bind and Drain.
- Adds a custom PTR1e Rule Element key:

```json
{
  "key": "PTUCharge",
  "frequency": "scene",
  "max": 2,
  "reset": "scene"
}
```

- Displays charge badges on item rows, for example `1/2 Scene` or `2/3 Daily`.
- Reduces charges automatically when a charged item is used from the Actor sheet or the chat Use button.
- Resets Scene charges when a combat encounter is deleted by the primary active GM.
- Adds manual `Scene` and `Daily` reset buttons on the Trainer sheet AP section.
- `Daily` reset also resets Scene charges, matching an Extended Rest style reset.
- Optional frequency auto-detection:
  - `Scene`
  - `Scene x2`
  - `Daily`
  - `Daily x3`
- `At-Will`, `EOT`, and `Static` do not create charge pools from auto-detection.

## Storage

Charge state is stored on the owned Item:

```text
flags.ptr1e-ap-charges.chargeState
```

The module uses flags instead of adding custom system fields, keeping it separate from PTR1e schema migrations.

## Local Install

Copy this folder into your Foundry modules directory:

```text
FoundryVTT/Data/modules/ptr1e-ap-charges
```

Then enable `PTR1e AP Charges` in your PTR1e world.

## Forge / Foundry Manifest Install

After a GitHub release is published, install from this manifest URL:

```text
https://github.com/marcbenoitcote-star/ptr1e-ap-charges/releases/latest/download/module.json
```

The GitHub repository and release assets must be public so Forge and Foundry can download them without authentication.

## Usage

1. Open a Trainer Actor sheet.
2. Check the AP section on the Stats tab.
3. Add `AP-Bind-X` or `AP-Drain-X` keywords to active Items, Features, Moves, Abilities, or Effects.
4. To manually define charges, open an Item sheet, go to Rules, add `PTUCharge`, and set Frequency, Max Charges, and Reset.
5. If auto-detection is enabled, charge badges are created from item frequency text such as `Scene x2` or `Daily x3`.
6. Click a charged Feature or Move from the Actor sheet. Its charge count decreases automatically.
7. Use the `Scene` or `Daily` buttons in the AP section to reset charges manually.

## Test Checklist

- The AP range is replaced by a segmented meter on Trainer sheets.
- Green segments match current usable AP.
- Grey segments show spent usable AP.
- Yellow segments match total AP Bind.
- Red segments match total AP Drain.
- The AP text shows `Bind: X | Drain: Y`.
- The AP tooltip shows available, bind, drain, and maximum values.
- `AP-Bind-2` on an active item adds 2 Bind.
- `AP-Drain-1` on an active item adds 1 Drain.
- Disabling an item removes its keyword AP contribution.
- A native PTR1e `ActionPoint` Rule Element still contributes to the meter.
- Entering AP above usable maximum warns and clamps the value.
- A `PTUCharge` rule with max 2 displays `2/2 Scene` when unused.
- Using the item once changes it to `1/2 Scene`.
- Using it with 0 charges left is blocked with a warning.
- `Scene x2` creates a 2-charge Scene pool when auto-detection is enabled.
- `Daily x3` creates a 3-charge Daily pool when auto-detection is enabled.
- `At-Will`, `EOT`, and `Static` do not create charge pools automatically.
- Scene reset restores Scene charges.
- Daily reset restores Daily and Scene charges.
- Deleting a combat encounter resets Scene charges for Trainer combatants.
