# PTR1e AP Charges

External Foundry VTT module for Pokemon Tabletop Reunited (`ptu`). It improves Action Point visibility and adds charge tracking for Feature, Edge, and Move usage on Trainer and Pokemon actors.

## Features

- Replaces the Trainer sheet AP range with a segmented AP meter.
- Detects AP text such as `AP-Bind-2`, `AP-Drain-1`, `Bind 2 AP`, and `Drain 1 AP` on owned Items, Features, Edges, Moves, Abilities, and Effects.
- Adds row buttons to activate/deactivate AP Bind and apply/remove AP Drain when those costs are found.
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

- Displays charge controls on item rows, for example `1/2 Scene` or `2/3 Daily`.
- Allows manual charge use, decrease, increase, and reset from the item row.
- Reduces charges automatically when a charged item is used from the Actor sheet or the chat Use button.
- Supports Trainer Features, Edges, and Moves, plus Pokemon Moves.
- Resets Scene charges when a combat encounter is deleted by the primary active GM.
- Adds manual `Scene` and `Daily / Extended Rest` reset buttons on supported Actor sheets.
- `Daily / Extended Rest` reset also resets Scene charges and removes active AP Drain states.
- Optional frequency auto-detection:
  - `Scene`
  - `Scene x2`
  - `Scene X2`
  - `Scene x3`
  - `Scene x2` using the multiplication sign
  - `Daily`
  - `Daily x3`
- `Daily x5`
- `At-Will`, `EOT`, `Static`, and `Special` do not create charge pools from auto-detection.

## Storage

Charge state is stored on the owned Item:

```text
flags.ptr1e-ap-charges.chargeState
```

Manual AP Bind/Drain state is also stored on the owned Item:

```text
flags.ptr1e-ap-charges.apState
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

1. Open a Trainer or Pokemon Actor sheet.
2. Check the AP section on Trainer sheets and the item rows on Trainer/Pokemon sheets.
3. Add AP text such as `AP-Bind-2`, `AP-Drain-1`, `Bind 2 AP`, or `Drain 1 AP` to active Items, Features, Edges, Moves, Abilities, or Effects.
4. Use the row button to activate Bind or apply Drain.
5. To manually define charges, open an Item sheet, go to Rules, add `PTUCharge`, and set Frequency, Max Charges, and Reset.
6. If auto-detection is enabled, charge controls are created from item frequency text such as `Scene x2` or `Daily x3`.
7. Click a charged Feature, Edge, or Move from the Actor sheet. Its charge count decreases automatically when PTR1e uses the item/attack.
8. Use the row charge buttons to manually spend, increase, decrease, or reset an item.
9. Use the `Scene` or `Daily` buttons on the Actor sheet to reset charges manually.

## Test Checklist

- The AP range is replaced by a segmented meter on Trainer sheets.
- Green segments match current usable AP.
- Grey segments show spent usable AP.
- Yellow segments match total AP Bind.
- Red segments match total AP Drain.
- The AP text shows `Bind: X | Drain: Y`.
- The AP tooltip shows available, bind, drain, and maximum values.
- `AP-Bind-2` on an active item shows an Activate Bind button.
- Clicking Activate Bind adds 2 Bind and changes the AP meter yellow.
- Clicking Disable Bind removes that Bind.
- `Drain 1 AP` on an active item shows an Apply Drain button.
- Clicking Apply Drain adds 1 Drain and changes the AP meter red.
- Clicking Remove Drain clears that Drain.
- Daily / Extended Rest reset clears active Drain states.
- Disabling an item removes its AP controls and contribution.
- A native PTR1e `ActionPoint` Rule Element still contributes to the meter.
- Entering AP above usable maximum warns and clamps the value.
- A `PTUCharge` rule with max 2 displays `2/2 Scene` when unused.
- Using the item once changes it to `1/2 Scene`.
- The row `-`, `+`, and reset controls manually adjust the charge state.
- Using it with 0 charges left is blocked with a warning.
- `Scene x2` creates a 2-charge Scene pool when auto-detection is enabled.
- `Scene X2`, `Scene x3`, and `Scene x2` with the multiplication sign are detected.
- `Daily x3` creates a 3-charge Daily pool when auto-detection is enabled.
- `Daily x5` creates a 5-charge Daily pool when auto-detection is enabled.
- `At-Will`, `EOT`, `Static`, and `Special` do not create charge pools automatically.
- A manual `PTUCharge` rule still creates charges even when auto-detection would not.
- Trainer Edges with frequency text show charge controls.
- Pokemon Moves such as `Hydro Pump` with `Frequency: Scene x2` show and consume `2/2 Scene` charges.
- Scene reset restores Scene charges.
- Daily reset restores Daily and Scene charges.
- Deleting a combat encounter resets Scene charges for Trainer and Pokemon combatants.
