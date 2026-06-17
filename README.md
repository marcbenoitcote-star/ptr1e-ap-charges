# PTR1e AP Charges

External Foundry VTT module for Pokemon Tabletop Reunited (`ptu`). It improves Action Point visibility and adds charge tracking for Feature, Edge, and Move usage on Trainer and Pokemon actors.

## Features

- Replaces the Trainer sheet AP range with a segmented AP meter.
- Detects AP text such as `AP-Bind-2`, `AP-Drain-1`, `Bind 2 AP`, and `Drain 1 AP` on owned Items, Features, Edges, Moves, Abilities, and Effects.
- Adds row buttons to activate/deactivate AP Bind and apply/remove AP Drain when those costs are found.
- Adds manual Actor AP controls for emergency corrections:
  - Temp AP `-`, numeric value, and `+`.
  - Bind AP `-`, numeric value, and `+`.
  - Drain AP `-`, numeric value, and `+`.
  - Reset manual Bind, manual Drain, or both.
  - Full `New Day` AP reset with a recovery/options dialog.
  - GM-only selected-token full reset button.
- Optional chat logging for manual AP changes.
- Adds Temporary AP support:
  - Positive Temp AP increases the effective AP maximum.
  - Negative Temp AP reduces the effective AP maximum.
  - Temp AP appears in blue on the AP bar.
- Also respects PTR1e native `ActionPoint` Rule Elements when present.
- AP segment colors:
  - Green: currently available AP.
  - Grey: spent usable AP.
  - Blue: Temporary AP.
  - Yellow: AP Bind.
  - Red: AP Drain.
- Adds AP text under the meter: `Temp AP: X | Bind: Y | Drain: Z`.
- Adds a tooltip: `Available: X / Temp: Y / Bind: Z / Drain: W / Maximum: N`.
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

- Adds a custom Temporary AP Rule Element key:

```json
{
  "key": "TemporaryAPBonus",
  "value": 2
}
```

- `TemporaryAPBonus` also supports negative values, for example `{ "key": "TemporaryAPBonus", "value": -1 }`.
- The `PTUCharge` Rule Element is localized as `Charge Number`.
- Displays charge controls on item rows, for example `1/2 Scene` or `2/3 Daily`.
- Allows manual charge use, decrease, increase, and reset from the item row.
- Reduces charges automatically when a charged item is used from the Actor sheet or the chat Use button.
- Supports Trainer Features, Edges, and Moves, plus Pokemon Moves.
- Resets Scene charges when a combat encounter is deleted by the primary active GM.
- Adds manual `Scene` and `Daily / Extended Rest` reset buttons on supported Actor sheets.
- `Daily / Extended Rest` reset also resets Scene charges and removes active AP Drain states.
- `New Day` opens an options dialog with Bandage recovery and AP/charge reset choices.
- With Bandage: heals 3 Injuries and restores HP to the actor's recalculated maximum.
- Without Bandage: heals 1 Injury and restores HP equal to 3 natural-healing ticks.
- `New Day` can reset manual Temporary AP, restore current AP to the usable maximum, and reset Daily/Scene charge pools based on the selected options.
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

Manual Actor AP corrections are stored on the Actor:

```text
flags.ptr1e-ap-charges.actorApState
```

Temporary AP from Rule Elements is calculated from active owned Items, Features, Moves, Abilities, and Effects and is not stored separately.

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
5. Use the Manual AP panel on a Trainer sheet to add or remove manual Temp/Bind/Drain AP without editing an Item.
6. To manually define charges, open an Item sheet, go to Rules, add `PTUCharge`, and set Frequency, Max Charges, and Reset.
7. If auto-detection is enabled, charge controls are created from item frequency text such as `Scene x2` or `Daily x3`.
8. Click a charged Feature, Edge, or Move from the Actor sheet. Its charge count decreases automatically when PTR1e uses the item/attack.
9. Use the row charge buttons to manually spend, increase, decrease, or reset an item.
10. Use the `Scene`, `Daily`, or `New Day` buttons on the Actor sheet to reset charges and AP state manually.

## Test Checklist

- The AP range is replaced by a segmented meter on Trainer sheets.
- Green segments match current usable AP.
- Grey segments show spent usable AP.
- Blue segments show positive Temporary AP.
- Yellow segments match total AP Bind.
- Red segments match total AP Drain.
- The AP text shows `Temp AP: X | Bind: Y | Drain: Z`.
- The AP tooltip shows available, temp, bind, drain, and maximum values.
- Positive manual Temp AP increases the AP maximum and appears blue.
- Negative manual Temp AP reduces the AP maximum.
- `TemporaryAPBonus` with `value: 2` adds +2 Temp AP while active.
- `TemporaryAPBonus` with `value: -1` subtracts 1 Temp AP while active.
- Disabling the Item or Effect with `TemporaryAPBonus` removes its Temp AP contribution.
- `PTUCharge` appears as `Charge Number` in the Rule Element type list.
- `AP-Bind-2` on an active item shows an Activate Bind button.
- Clicking Activate Bind adds 2 Bind and changes the AP meter yellow.
- Clicking Disable Bind removes that Bind.
- `Drain 1 AP` on an active item shows an Apply Drain button.
- Clicking Apply Drain adds 1 Drain and changes the AP meter red.
- Clicking Remove Drain clears that Drain.
- The Manual AP panel can add `+1` or remove `-1` manual Bind AP.
- The Manual AP panel can add `+1` or remove `-1` manual Drain AP.
- The Manual AP panel can add or remove manual Temp AP.
- Manual Temp/Bind/Drain numeric fields can be edited directly.
- Manual Bind/Drain values never go below 0.
- Non-GM users cannot set manual Bind/Drain above the Actor AP maximum.
- A GM can force a higher value by typing it directly, or by holding Shift while clicking `+`.
- Reset Bind clears manual Actor Bind AP.
- Reset Drain clears manual Actor Drain AP.
- Reset Both clears both manual Actor values.
- New Day opens a dialog with Bandage, reset, AP restore, Daily charge, and Scene charge options.
- New Day with Bandage heals 3 Injuries and restores HP to maximum.
- New Day without Bandage heals 1 Injury and restores 3 natural-healing ticks.
- New Day can reset manual Temp AP when `Reset Temporary AP` is checked.
- New Day restores current AP to the usable maximum when `Restore AP to Maximum` is checked.
- New Day resets Daily and Extended Rest charge pools when `Reset Daily Charges` is checked.
- New Day resets Scene charge pools when `Reset Scene Charges` is checked.
- The selected-token full reset button affects selected owned tokens instead of the open sheet Actor.
- When the chat logging setting is enabled, manual AP changes create chat messages.
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
