const MODULE_ID = "ptr1e-ap-charges";
const CHARGE_FLAG = "chargeState";
const AP_STATE_FLAG = "apState";
const ACTOR_AP_FLAG = "actorApState";
const PATCHED = Symbol("ptr1eApChargesPatched");
const ATTACK_PATCHED = Symbol("ptr1eApChargesAttackPatched");

const SETTINGS = {
  autoDetect: "autoDetectFrequency",
  clampAp: "clampAp",
  chatApChanges: "chatApChanges"
};

const CHARGE_FREQUENCIES = {
  scene: { labelKey: "PTR_AP.Scene", fallback: "Scene" },
  daily: { labelKey: "PTR_AP.Daily", fallback: "Daily" }
};

const RESET_TYPES = {
  scene: { labelKey: "PTR_AP.Scene", fallback: "Scene" },
  daily: { labelKey: "PTR_AP.Daily", fallback: "Daily" },
  extendedRest: { labelKey: "PTR_AP.ExtendedRest", fallback: "Extended Rest" }
};

Hooks.once("init", () => {
  registerSettings();
  registerChargeRuleElement();
});

Hooks.once("setup", () => {
  registerChargeRuleElement();
});

Hooks.once("ready", () => {
  if (game.system.id !== "ptu") return;
  registerChargeRuleElement();
  patchItemUse();
  patchPrepareAttack();
  exposeApi();
  console.log(`${MODULE_ID} | Ready.`);
});

for (const hook of ["renderActorSheet", "renderPTUActorSheet", "renderPTUCharacterSheet", "renderPTUPokemonSheet"]) {
  Hooks.on(hook, (app, html) => {
    enhanceActorSheet(app, html).catch((error) => warn("actor-sheet", error));
  });
}

for (const hook of ["renderItemSheet", "renderPTUItemSheet"]) {
  Hooks.on(hook, (app, html) => {
    enhanceItemSheet(app, html).catch((error) => warn("item-sheet", error));
  });
}

Hooks.on("preUpdateActor", (actor, changes, _options, userId) => {
  if (game.system.id !== "ptu" || !hasApResource(actor) || !game.settings.get(MODULE_ID, SETTINGS.clampAp)) return;
  const nextValue = foundry.utils.getProperty(changes, "system.ap.value");
  if (nextValue === undefined) return;

  const ap = getActorApData(actor);
  const next = clampInt(nextValue, 0, 999);
  const clamped = clampInt(next, 0, ap.usableMax);
  if (next === clamped) return;

  foundry.utils.setProperty(changes, "system.ap.value", clamped);
  if (userId === game.user.id) {
    ui.notifications.warn(format("PTR_AP.Notify.ApClamped", { name: actor.name, usable: ap.usableMax }, `${actor.name} can only use ${ap.usableMax} AP after Bind and Drain.`));
  }
});

Hooks.on("createItem", (item) => refreshActorApAfterItemChange(item));
Hooks.on("updateItem", (item) => refreshActorApAfterItemChange(item));
Hooks.on("deleteItem", (item) => refreshActorApAfterItemChange(item));

Hooks.on("deleteCombat", (combat) => {
  if (!isPrimaryGM()) return;
  resetCombatantCharges(combat, "scene").catch((error) => warn("combat-scene-reset", error));
});

Hooks.on("updateCombat", (combat, changes) => {
  if (!isPrimaryGM() || changes.active !== false) return;
  resetCombatantCharges(combat, "scene").catch((error) => warn("combat-scene-reset", error));
});

function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.autoDetect, {
    name: "PTR_AP.Settings.AutoDetect.Name",
    hint: "PTR_AP.Settings.AutoDetect.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.clampAp, {
    name: "PTR_AP.Settings.ClampAp.Name",
    hint: "PTR_AP.Settings.ClampAp.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.chatApChanges, {
    name: "PTR_AP.Settings.ChatApChanges.Name",
    hint: "PTR_AP.Settings.ChatApChanges.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
}

function registerChargeRuleElement() {
  const elements = globalThis.CONFIG?.PTU?.rule?.elements;
  const actionPoint = elements?.builtin?.ActionPoint;
  const baseClass = actionPoint ? Object.getPrototypeOf(actionPoint) : null;
  if (!elements?.custom || typeof baseClass !== "function") return;

  const fields = foundry.data.fields;
  if (!elements.custom.PTUCharge) {
    class PTUChargeRuleElement extends baseClass {
      static defineSchema() {
        return {
          ...super.defineSchema(),
          frequency: new fields.StringField({ required: false, nullable: false, blank: false, initial: "scene" }),
          max: new fields.NumberField({ required: false, nullable: false, integer: true, min: 1, initial: 1 }),
          reset: new fields.StringField({ required: false, nullable: false, blank: false, initial: "scene" })
        };
      }
    }

    elements.custom.PTUCharge = PTUChargeRuleElement;
  }

  if (!elements.custom.TemporaryAPBonus) {
    class TemporaryAPBonusRuleElement extends baseClass {
      static defineSchema() {
        return {
          ...super.defineSchema(),
          value: new fields.NumberField({ required: false, nullable: false, integer: true, initial: 0 })
        };
      }
    }

    elements.custom.TemporaryAPBonus = TemporaryAPBonusRuleElement;
  }
}

async function enhanceActorSheet(app, html) {
  const actor = app?.actor ?? app?.document ?? app?.object;
  if (!isSupportedActor(actor)) return;

  const root = getSheetRoot(app, html);
  if (!root) return;

  if (hasApResource(actor)) injectApMeter(actor, root);
  else injectResetControls(actor, root);
  injectItemBadgesAndControls(actor, root);
  bindActorSheetControls(actor, root);
}

function injectApMeter(actor, root) {
  root.querySelectorAll(".ptr-ap-meter, .ptr-ap-manual-controls, .ptr-ap-charge-controls").forEach((element) => element.remove());
  const ap = getActorApData(actor);
  const tooltip = format("PTR_AP.Tooltip", ap, `Available: ${ap.available} / Temp: ${ap.temporaryLabel} / Bind: ${ap.bind} / Drain: ${ap.drain} / Maximum: ${ap.maximum}`);

  for (const range of root.querySelectorAll(".ap-range")) {
    range.classList.add("ptr-ap-native-range");
    range.min = 0;
    range.max = ap.usableMax;
    range.title = tooltip;

    const host = range.closest(".w-100") ?? range.parentElement;
    if (!host) continue;
    host.insertAdjacentElement("afterend", renderApMeter(ap, tooltip));
  }

  for (const input of root.querySelectorAll('input[name="system.ap.value"], input[name="system.ap.value input"]')) {
    input.min = 0;
    input.max = ap.usableMax;
    input.title = tooltip;
  }

  injectManualApControls(actor, root);
  injectResetControls(actor, root);

  queueActorApClamp(actor, ap);
}

function renderApMeter(ap, tooltip) {
  const wrapper = document.createElement("div");
  wrapper.className = "ptr-ap-meter";
  wrapper.title = tooltip;

  const segments = document.createElement("div");
  segments.className = "ptr-ap-segments";
  segments.style.gridTemplateColumns = `repeat(${Math.max(ap.visualMaximum, 1)}, minmax(0, 1fr))`;

  for (let index = 0; index < ap.visualMaximum; index++) {
    const segment = document.createElement("span");
    segment.className = `ptr-ap-segment ${getApSegmentClass(index, ap)}`;
    segment.title = tooltip;
    segments.append(segment);
  }

  const summary = document.createElement("div");
  summary.className = "ptr-ap-summary";
  summary.textContent = format("PTR_AP.TempBindDrain", ap, `Temp AP: ${ap.temporaryLabel} | Bind: ${ap.bind} | Drain: ${ap.drain}`);

  wrapper.append(segments, summary);
  return wrapper;
}

function getApSegmentClass(index, ap) {
  if (index < ap.available) return ap.temporary > 0 && index >= ap.baseMaximum ? "temporary" : "available";
  if (index < ap.maximum) return ap.temporary > 0 && index >= ap.baseMaximum ? "temporary spent" : "spent";
  if (index < ap.maximum + ap.bind) return "bind";
  return "drain";
}

function injectManualApControls(actor, root) {
  root.querySelectorAll(".ptr-ap-manual-controls").forEach((element) => element.remove());
  if (!actor.isOwner || !hasApResource(actor)) return;

  const apBody = root.querySelector(".ap-range")?.closest(".swsh-box")?.querySelector(".swsh-body");
  if (apBody) apBody.insertAdjacentElement("beforeend", renderManualApControls(actor));
}

function renderManualApControls(actor) {
  const state = getActorManualApState(actor);
  const limit = getActorManualApLimit(actor, game.user?.isGM);
  const tempLimit = getActorManualTempApLimit(actor, game.user?.isGM);
  const wrapper = document.createElement("div");
  wrapper.className = "ptr-ap-manual-controls";

  const title = document.createElement("div");
  title.className = "ptr-ap-manual-title";
  title.textContent = label("PTR_AP.Manual.Title", "Manual AP");

  const rows = document.createElement("div");
  rows.className = "ptr-ap-manual-rows";
  rows.append(
    renderManualApRow("temp", state.temp, -tempLimit, tempLimit, label("PTR_AP.TempAP", "Temp AP")),
    renderManualApRow("bind", state.bind, 0, limit, label("PTR_AP.BindAP", "Bind AP")),
    renderManualApRow("drain", state.drain, 0, limit, label("PTR_AP.DrainAP", "Drain AP"))
  );

  const resetRow = document.createElement("div");
  resetRow.className = "ptr-ap-manual-resets";
  resetRow.append(
    renderTextButton("manual-temp-reset", "", label("PTR_AP.ResetTempAP", "Reset Temp"), ""),
    renderTextButton("manual-bind-reset", "", label("PTR_AP.ResetBindAP", "Reset Bind"), ""),
    renderTextButton("manual-drain-reset", "", label("PTR_AP.ResetDrainAP", "Reset Drain"), ""),
    renderTextButton("manual-both-reset", "", label("PTR_AP.ResetBindDrainAP", "Reset Bind + Drain"), "")
  );

  wrapper.append(title, rows, resetRow);
  return wrapper;
}

function renderManualApRow(kind, value, min, max, labelText) {
  const row = document.createElement("div");
  row.className = `ptr-ap-manual-row ${kind}`;

  const labelElement = document.createElement("label");
  labelElement.textContent = labelText;

  const minus = renderIconButton(`manual-${kind}-decrease`, "", "fa-minus", label("PTR_AP.DecreaseManualAP", "Decrease manual AP"));

  const input = document.createElement("input");
  input.type = "number";
  input.min = min;
  input.max = max;
  input.step = 1;
  input.value = value;
  input.dataset.ptrApManualField = kind;
  input.title = label("PTR_AP.SetManualAP", "Set manual AP");

  const plus = renderIconButton(`manual-${kind}-increase`, "", "fa-plus", label("PTR_AP.IncreaseManualAP", "Increase manual AP"));

  row.append(labelElement, minus, input, plus);
  return row;
}

function injectResetControls(actor, root) {
  root.querySelectorAll(".ptr-ap-charge-controls").forEach((element) => element.remove());
  if (!actor.isOwner) return;

  const apBody = root.querySelector(".ap-range")?.closest(".swsh-box")?.querySelector(".swsh-body");
  if (apBody) {
    apBody.insertAdjacentElement("beforeend", renderResetControls());
    return;
  }

  const tab = root.querySelector('.tab[data-tab="moves"], .tab[data-tab="features"], .sheet-body');
  if (tab) tab.insertAdjacentElement("afterbegin", renderResetControls("standalone"));
}

function renderResetControls(extraClass = "") {
  const controls = document.createElement("div");
  controls.className = `ptr-ap-charge-controls ${extraClass}`.trim();

  const scene = document.createElement("button");
  scene.type = "button";
  scene.dataset.ptrApAction = "reset-scene";
  scene.title = label("PTR_AP.ResetScene", "Reset Scene");
  scene.innerHTML = `<i class="fas fa-rotate-right"></i> <span>${escapeHtml(label("PTR_AP.Scene", "Scene"))}</span>`;

  const daily = document.createElement("button");
  daily.type = "button";
  daily.dataset.ptrApAction = "reset-daily";
  daily.title = label("PTR_AP.ResetDaily", "Reset Daily / Extended Rest");
  daily.innerHTML = `<i class="fas fa-bed"></i> <span>${escapeHtml(label("PTR_AP.Daily", "Daily"))}</span>`;

  const full = document.createElement("button");
  full.type = "button";
  full.dataset.ptrApAction = "reset-full";
  full.title = label("PTR_AP.FullReset", "New Day / Full AP Reset");
  full.innerHTML = `<i class="fas fa-sun"></i> <span>${escapeHtml(label("PTR_AP.NewDay", "New Day"))}</span>`;

  controls.append(scene, daily, full);

  if (game.user?.isGM) {
    const selected = document.createElement("button");
    selected.type = "button";
    selected.dataset.ptrApAction = "reset-selected-full";
    selected.title = label("PTR_AP.FullResetSelected", "Full AP reset for selected tokens");
    selected.innerHTML = `<i class="fas fa-users"></i> <span>${escapeHtml(label("PTR_AP.SelectedTokens", "Selected"))}</span>`;
    controls.append(selected);
  }

  return controls;
}

function injectItemBadgesAndControls(actor, root) {
  root.querySelectorAll(".ptr-ap-charge-control, .ptr-ap-cost-controls").forEach((element) => element.remove());
  for (const row of root.querySelectorAll("li.item[data-item-id]")) {
    const item = getItemFromRow(actor, row);
    if (!item) continue;

    const state = getChargeState(item);
    const apCost = getManualApConfig(item);
    if (!state && !apCost) continue;

    const tagTarget = row.querySelector(".move-tags") ?? row.querySelector(".item-tags") ?? row.querySelector(".item-controls");
    const controlTarget = row.querySelector(".move-tags") ?? row.querySelector(".item-tags") ?? row.querySelector(".item-controls");
    if (state && tagTarget) tagTarget.append(renderChargeControl(item, state));
    if (apCost && controlTarget) controlTarget.prepend(renderApCostControls(item, apCost));
  }
}

function renderChargeControl(item, state) {
  const control = document.createElement("div");
  control.className = "ptr-ap-charge-control";
  control.dataset.itemId = item.id;

  const useButton = renderIconButton("charge-use", item.id, "fa-play", label("PTR_AP.UseCharge", "Use Charge"));
  const minusButton = renderIconButton("charge-decrease", item.id, "fa-minus", label("PTR_AP.DecreaseCharge", "Decrease Charge"));
  const plusButton = renderIconButton("charge-increase", item.id, "fa-plus", label("PTR_AP.IncreaseCharge", "Increase Charge"));
  const resetButton = renderIconButton("charge-reset", item.id, "fa-rotate-right", label("PTR_AP.ResetCharge", "Reset Charge"));

  const badge = document.createElement("span");
  badge.className = `ptr-ap-charge-badge ${state.frequency} ${state.remaining <= 0 ? "empty" : ""}`;
  badge.title = `${state.remaining}/${state.max} ${state.frequencyLabel}`;
  badge.textContent = `${state.remaining}/${state.max} ${state.frequencyLabel}`;

  control.append(useButton, minusButton, badge, plusButton, resetButton);
  return control;
}

function renderApCostControls(item, config) {
  const controls = document.createElement("div");
  controls.className = "ptr-ap-cost-controls";
  controls.dataset.itemId = item.id;

  const state = getManualApState(item, config);
  if (config.bind > 0) {
    const bindButton = renderTextButton(
      "toggle-bind",
      item.id,
      state.bindActive ? label("PTR_AP.DisableBind", "Disable Bind") : label("PTR_AP.ActivateBind", "Activate Bind"),
      `${config.bind} AP`
    );
    if (state.bindActive) bindButton.classList.add("active");
    controls.append(bindButton);
  }

  if (config.drain > 0) {
    const drainButton = renderTextButton(
      "toggle-drain",
      item.id,
      state.drainActive ? label("PTR_AP.RemoveDrain", "Remove Drain") : label("PTR_AP.ApplyDrain", "Apply Drain"),
      `${config.drain} AP`
    );
    if (state.drainActive) drainButton.classList.add("active");
    controls.append(drainButton);
  }

  return controls;
}

function renderIconButton(action, itemId, icon, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.ptrApAction = action;
  button.dataset.itemId = itemId;
  button.title = title;
  button.innerHTML = `<i class="fas ${icon}"></i>`;
  return button;
}

function renderTextButton(action, itemId, labelText, detail) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.ptrApAction = action;
  button.dataset.itemId = itemId;
  button.title = detail ? `${labelText} (${detail})` : labelText;
  button.innerHTML = detail
    ? `<span>${escapeHtml(labelText)}</span><small>${escapeHtml(detail)}</small>`
    : `<span>${escapeHtml(labelText)}</span>`;
  return button;
}

function bindActorSheetControls(actor, root) {
  if (root.dataset.ptrApChargesBound === "true") return;
  root.dataset.ptrApChargesBound = "true";

  root.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-ptr-ap-action]");
    if (actionButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleActorActionClick(actor, actionButton, event).catch((error) => warn("actor-action", error));
      return;
    }
  }, true);

  root.addEventListener("change", (event) => {
    const input = event.target;
    const manualField = input?.dataset?.ptrApManualField;
    if (manualField) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setActorManualAp(actor, manualField, input.value, { force: game.user?.isGM, notify: true })
        .catch((error) => warn("manual-ap-input", error));
      return;
    }

    if (!input?.matches?.('.ap-range, input[name="system.ap.value"], input[name="system.ap.value input"]')) return;
    const ap = getActorApData(actor);
    const next = clampInt(input.value, 0, 999);
    if (next <= ap.usableMax) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = ap.usableMax;
    ui.notifications.warn(format("PTR_AP.Notify.ApClamped", { name: actor.name, usable: ap.usableMax }, `${actor.name} can only use ${ap.usableMax} AP after Bind and Drain.`));
    actor.update({ "system.ap.value": ap.usableMax });
  }, true);
}

async function handleActorActionClick(actor, button, event = null) {
  const action = button.dataset.ptrApAction;
  if (action === "reset-scene" || action === "reset-daily") {
    const resetType = action === "reset-daily" ? "daily" : "scene";
    await resetActorCharges(actor, resetType, { notify: true });
    return;
  }

  if (action === "reset-full") {
    const options = await promptNewDayOptions([actor]);
    if (options) {
      await resetActorFullAp(actor, { ...options, notify: true });
    }
    return;
  }

  if (action === "reset-selected-full") {
    const actors = getSelectedTokenActors();
    if (actors.length === 0) {
      ui.notifications.warn(label("PTR_AP.Notify.NoSelectedTokens", "No selected owned tokens to reset."));
      return;
    }
    const options = await promptNewDayOptions(actors);
    if (options) {
      for (const selectedActor of actors) {
        await resetActorFullAp(selectedActor, { ...options, notify: true });
      }
    }
    return;
  }

  const manualMatch = /^manual-(temp|bind|drain|both)-(increase|decrease|reset)$/.exec(action);
  if (manualMatch) {
    const [, kind, operation] = manualMatch;
    const force = game.user?.isGM && !!event?.shiftKey;
    if (operation === "reset") await resetActorManualAp(actor, kind, { notify: true });
    else await adjustActorManualAp(actor, kind, operation === "increase" ? 1 : -1, { force, notify: true });
    return;
  }

  const item = getItemFromAction(actor, button);
  if (!item) return;

  if (action === "charge-use") {
    await consumeCharge(item, 1, { notify: true });
    return;
  }

  if (action === "charge-decrease") {
    await adjustCharge(item, -1);
    return;
  }

  if (action === "charge-increase") {
    await adjustCharge(item, 1);
    return;
  }

  if (action === "charge-reset") {
    await resetItemCharge(item);
    return;
  }

  if (action === "toggle-bind" || action === "toggle-drain") {
    await toggleManualApState(item, action === "toggle-bind" ? "bind" : "drain");
  }
}

async function enhanceItemSheet(app, html) {
  const item = app?.item ?? app?.document ?? app?.object;
  if (!item) return;

  const root = getSheetRoot(app, html);
  if (!root) return;

  injectChargeRuleForms(item, root);
}

function injectChargeRuleForms(item, root) {
  root.querySelectorAll('.rule-body[data-key="PTUCharge"]').forEach((body) => {
    if (body.querySelector(".ptr-ap-rule-form")) return;
    const index = Number(body.dataset.idx);
    const rule = item.toObject().system?.rules?.[index];
    if (!rule) return;

    body.innerHTML = "";
    body.append(renderChargeRuleForm(rule, index));
  });

  root.querySelectorAll('.rule-body[data-key="TemporaryAPBonus"]').forEach((body) => {
    if (body.querySelector(".ptr-ap-temp-rule-form")) return;
    const index = Number(body.dataset.idx);
    const rule = item.toObject().system?.rules?.[index];
    if (!rule) return;

    body.innerHTML = "";
    body.append(renderTemporaryApRuleForm(rule, index));
  });

  if (root.dataset.ptrApRuleFormBound === "true") return;
  root.dataset.ptrApRuleFormBound = "true";
  root.addEventListener("change", (event) => {
    const field = event.target?.dataset?.ptrApRuleField;
    if (!field) return;

    const form = event.target.closest("[data-ptr-ap-rule-index]");
    const index = Number(form?.dataset.ptrApRuleIndex);
    if (!Number.isInteger(index)) return;

    const rules = foundry.utils.deepClone(item.toObject().system?.rules ?? []);
    if (!rules[index]) return;

    const value = field === "max"
      ? clampInt(event.target.value, 1, 99)
      : field === "reset"
        ? normalizeReset(event.target.value) ?? "scene"
        : normalizeFrequency(event.target.value) ?? "scene";
    rules[index][field] = value;
    item.update({ "system.rules": rules });
  });

  root.addEventListener("change", (event) => {
    const field = event.target?.dataset?.ptrApTempRuleField;
    if (!field) return;

    const form = event.target.closest("[data-ptr-ap-rule-index]");
    const index = Number(form?.dataset.ptrApRuleIndex);
    if (!Number.isInteger(index)) return;

    const rules = foundry.utils.deepClone(item.toObject().system?.rules ?? []);
    if (!rules[index]) return;

    rules[index][field] = clampInt(event.target.value, -99, 99);
    item.update({ "system.rules": rules });
  });
}

function renderChargeRuleForm(rule, index) {
  const form = document.createElement("div");
  form.className = "ptr-ap-rule-form";
  form.dataset.ptrApRuleIndex = String(index);

  form.append(
    renderFieldLabel("PTR_AP.Rule.Frequency", "Frequency"),
    renderFrequencySelect("frequency", normalizeFrequency(rule.frequency) ?? "scene"),
    renderFieldLabel("PTR_AP.Rule.Max", "Max Charges"),
    renderNumberInput("max", clampInt(rule.max, 1, 99)),
    renderFieldLabel("PTR_AP.Rule.Reset", "Reset"),
    renderResetSelect("reset", normalizeReset(rule.reset ?? rule.frequency) ?? "scene")
  );

  return form;
}

function renderFieldLabel(key, fallback) {
  const labelElement = document.createElement("label");
  labelElement.textContent = label(key, fallback);
  return labelElement;
}

function renderTemporaryApRuleForm(rule, index) {
  const form = document.createElement("div");
  form.className = "ptr-ap-rule-form ptr-ap-temp-rule-form";
  form.dataset.ptrApRuleIndex = String(index);

  form.append(
    renderFieldLabel("PTR_AP.Rule.Value", "Value"),
    renderTempNumberInput("value", clampInt(rule.value, -99, 99))
  );

  return form;
}

function renderFrequencySelect(field, selected) {
  const select = document.createElement("select");
  select.dataset.ptrApRuleField = field;

  for (const id of Object.keys(CHARGE_FREQUENCIES)) {
    const option = document.createElement("option");
    option.value = id;
    option.selected = id === selected;
    option.textContent = getFrequencyLabel(id);
    select.append(option);
  }

  return select;
}

function renderResetSelect(field, selected) {
  const select = document.createElement("select");
  select.dataset.ptrApRuleField = field;

  for (const id of Object.keys(RESET_TYPES)) {
    const option = document.createElement("option");
    option.value = id;
    option.selected = id === selected;
    option.textContent = getResetLabel(id);
    select.append(option);
  }

  return select;
}

function renderTempNumberInput(field, value) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = -99;
  input.max = 99;
  input.step = 1;
  input.value = value;
  input.dataset.ptrApTempRuleField = field;
  return input;
}

function renderNumberInput(field, value) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = 1;
  input.max = 99;
  input.step = 1;
  input.value = value;
  input.dataset.ptrApRuleField = field;
  return input;
}

function patchItemUse() {
  const classes = [
    CONFIG.PTU?.Item?.documentClass,
    ...Object.values(CONFIG.PTU?.Item?.documentClasses ?? {})
  ].filter(Boolean);

  for (const cls of new Set(classes)) {
    const proto = cls.prototype;
    if (!Object.prototype.hasOwnProperty.call(proto, "use") || proto.use?.[PATCHED]) continue;

    const original = proto.use;
    async function patchedUse(options = {}) {
      const state = getChargeState(this);
      if (state) {
        const consumed = await consumeCharge(this, 1, { notify: true });
        if (!consumed) return null;
      }
      return original.call(this, options);
    }
    patchedUse[PATCHED] = true;
    proto.use = patchedUse;
  }
}

function patchPrepareAttack() {
  const proto = CONFIG.PTU?.Actor?.documentClass?.prototype;
  if (!proto?.prepareAttack || proto.prepareAttack[ATTACK_PATCHED]) return;

  const original = proto.prepareAttack;
  function patchedPrepareAttack(move) {
    const action = original.call(this, move);
    if (!action?.roll || !move || action.roll[PATCHED]) return action;

    const sourceItem = this.items?.get(move.id) ?? this.items?.get(move.realId) ?? move;
    const originalRoll = action.roll;
    async function patchedRoll(params = {}) {
      const state = getChargeState(sourceItem);
      if (state) {
        const consumed = await consumeCharge(sourceItem, 1, { notify: true });
        if (!consumed) return null;
      }
      return originalRoll.call(this, params);
    }
    patchedRoll[PATCHED] = true;
    action.roll = patchedRoll;
    return action;
  }

  patchedPrepareAttack[ATTACK_PATCHED] = true;
  proto.prepareAttack = patchedPrepareAttack;
}

function getActorApData(actor) {
  const nativeUsableMax = clampInt(actor.system?.ap?.max, 0, 999);
  const nativeBind = clampInt(actor.system?.ap?.bound, 0, 999);
  const nativeDrain = clampInt(actor.system?.ap?.drained, 0, 999);
  const itemAp = getItemApAdjustments(actor);
  const manualAp = getActorManualApState(actor);
  const temporary = getActorTemporaryAp(actor) + manualAp.temp;

  const bind = Math.max(nativeBind, itemAp.bind) + manualAp.bind;
  const drain = Math.max(nativeDrain, itemAp.drain) + manualAp.drain;
  const baseMaximum = Math.max(nativeUsableMax + nativeBind + nativeDrain, nativeUsableMax);
  const maximum = Math.max(0, baseMaximum + temporary);
  const usableMax = Math.max(0, maximum - bind - drain);
  const available = clampInt(actor.system?.ap?.value, 0, usableMax);

  return {
    available,
    baseMaximum,
    bind,
    drain,
    maximum,
    temporary,
    temporaryLabel: `${temporary >= 0 ? "+" : ""}${temporary}`,
    usableMax,
    visualMaximum: Math.max(0, maximum + bind + drain),
    spent: Math.max(0, usableMax - available)
  };
}

function getActorManualApState(actor) {
  const stored = actor?.getFlag?.(MODULE_ID, ACTOR_AP_FLAG) ?? {};
  return {
    bind: clampInt(stored.bind, 0, 999),
    drain: clampInt(stored.drain, 0, 999),
    temp: stored.temp === undefined ? 0 : clampInt(stored.temp, -999, 999)
  };
}

function getActorApMaximum(actor) {
  const nativeUsableMax = clampInt(actor.system?.ap?.max, 0, 999);
  const nativeBind = clampInt(actor.system?.ap?.bound, 0, 999);
  const nativeDrain = clampInt(actor.system?.ap?.drained, 0, 999);
  return Math.max(nativeUsableMax + nativeBind + nativeDrain, nativeUsableMax);
}

function getActorManualApLimit(actor, force = false) {
  return force && game.user?.isGM ? 999 : getActorApMaximum(actor);
}

function getActorManualTempApLimit(actor, force = false) {
  return force && game.user?.isGM ? 999 : Math.max(1, getActorApMaximum(actor));
}

async function adjustActorManualAp(actor, kind, delta, { force = false, notify = false } = {}) {
  if (!actor?.isOwner || !["temp", "bind", "drain"].includes(kind)) return false;
  const state = getActorManualApState(actor);
  const next = state[kind] + clampInt(delta, -999, 999);
  return setActorManualAp(actor, kind, next, { force, notify, delta });
}

async function setActorManualAp(actor, kind, value, { force = false, notify = false, delta = null } = {}) {
  if (!actor?.isOwner || !["temp", "bind", "drain"].includes(kind)) return false;
  const state = getActorManualApState(actor);
  const limit = kind === "temp" ? getActorManualTempApLimit(actor, force) : getActorManualApLimit(actor, force);
  const min = kind === "temp" ? -limit : 0;
  const previous = state[kind];
  state[kind] = clampInt(value, min, limit);
  await actor.setFlag(MODULE_ID, ACTOR_AP_FLAG, state);
  queueActorApClamp(actor);
  actor.sheet?.render(false);

  if (notify && previous !== state[kind]) {
    const change = delta === null ? state[kind] - previous : state[kind] - previous;
    const changeLabel = change >= 0 ? `+${change}` : String(change);
    const kindLabel = getApKindLabel(kind);
    await notifyApChange(actor, "PTR_AP.Notify.ManualAdjust", {
      name: actor.name,
      change: changeLabel,
      kind: kindLabel,
      value: state[kind]
    }, `${actor.name}: ${changeLabel} ${kindLabel} AP applied manually.`, { chat: true });
  }
  return true;
}

async function resetActorManualAp(actor, kind = "both", { notify = false } = {}) {
  if (!actor?.isOwner) return false;
  const state = getActorManualApState(actor);
  const resetBind = kind === "bind" || kind === "both";
  const resetDrain = kind === "drain" || kind === "both";
  const resetTemp = kind === "temp";
  if (resetTemp) state.temp = 0;
  if (resetBind) state.bind = 0;
  if (resetDrain) state.drain = 0;
  await actor.setFlag(MODULE_ID, ACTOR_AP_FLAG, state);
  queueActorApClamp(actor);
  actor.sheet?.render(false);

  if (notify) {
    const kindLabel = kind === "both" ? label("PTR_AP.BindDrainLabel", "Bind + Drain") : getApKindLabel(kind);
    await notifyApChange(actor, "PTR_AP.Notify.ManualReset", {
      name: actor.name,
      kind: kindLabel
    }, `${actor.name}: manual ${kindLabel} AP reset.`, { chat: true });
  }
  return true;
}

function getItemApAdjustments(actor) {
  const totals = { bind: 0, drain: 0 };
  const items = actor.items?.contents ?? Array.from(actor.items ?? []);

  for (const item of items) {
    if (!isActiveApSource(item)) continue;

    const rules = parseActionPointRules(item);
    totals.bind += rules.bind;
    totals.drain += rules.drain;

    const manual = getManualApConfig(item);
    if (!manual) continue;

    const state = getManualApState(item, manual);
    if (state.bindActive) totals.bind += manual.bind;
    if (state.drainActive) totals.drain += manual.drain;
  }

  return totals;
}

function getActorTemporaryAp(actor) {
  let total = 0;
  const items = actor.items?.contents ?? Array.from(actor.items ?? []);

  for (const item of items) {
    if (!isActiveApSource(item)) continue;
    total += parseTemporaryApRules(item);
  }

  return clampInt(total, -999, 999);
}

function parseTemporaryApRules(item) {
  let total = 0;
  for (const rule of item.system?.rules ?? []) {
    if (rule?.key !== "TemporaryAPBonus" || rule.ignored) continue;
    total += resolveSignedNumericValue(rule.value, item.actor, item);
  }
  return total;
}

function isActiveApSource(item) {
  if (!item) return false;
  if (item.system?.enabled === false) return false;
  if (item.enabled === false) return false;
  return ["feat", "edge", "move", "ability", "item", "effect", "condition", "pokeedge", "capability"].includes(item.type);
}

function getManualApConfig(item) {
  if (!isActiveApSource(item)) return null;

  const nativeRules = parseActionPointRules(item);
  const parsed = parseApText(collectItemText(item));
  const bind = nativeRules.bind > 0 ? 0 : parsed.bind;
  const drain = nativeRules.drain > 0 ? 0 : parsed.drain;
  if (bind <= 0 && drain <= 0) return null;

  return {
    bind,
    drain,
    signature: `bind:${bind}:drain:${drain}`
  };
}

function getManualApState(item, config = getManualApConfig(item)) {
  const stored = item?.getFlag?.(MODULE_ID, AP_STATE_FLAG) ?? {};
  if (!config || stored.signature !== config.signature) {
    return {
      bindActive: false,
      drainActive: false,
      signature: config?.signature ?? ""
    };
  }

  return {
    bindActive: !!stored.bindActive,
    drainActive: !!stored.drainActive,
    signature: config.signature
  };
}

async function toggleManualApState(item, kind) {
  const config = getManualApConfig(item);
  if (!config || !item?.isOwner) return false;

  const state = getManualApState(item, config);
  if (kind === "bind" && config.bind > 0) state.bindActive = !state.bindActive;
  if (kind === "drain" && config.drain > 0) state.drainActive = !state.drainActive;

  await item.setFlag(MODULE_ID, AP_STATE_FLAG, state);
  queueActorApClamp(item.actor);
  item.actor?.sheet?.render(false);
  return true;
}

function collectItemText(item) {
  return [
    item.name,
    item.system?.frequency,
    item.system?.effect,
    item.system?.snippet,
    item.system?.notes,
    item.system?.trigger,
    item.system?.range,
    ...normalizeKeywords(item.system?.keywords)
  ].filter(Boolean).join(" ");
}

function parseApText(text) {
  const totals = { bind: 0, drain: 0 };
  const source = String(text ?? "");
  const patterns = [
    /\bAP[-\s]?(Bind|Drain)[-\s:]?(\d+)\b/gi,
    /\b(Bind|Drain)\s+(\d+)\s*AP\b/gi,
    /\b(\d+)\s*AP\s*(Bind|Drain)\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const first = String(match[1] ?? "");
      const second = String(match[2] ?? "");
      const kindText = /\d+/.test(first) ? second : first;
      const valueText = /\d+/.test(first) ? first : second;
      const kind = kindText.toLowerCase() === "bind" ? "bind" : kindText.toLowerCase() === "drain" ? "drain" : null;
      if (!kind) continue;
      totals[kind] = Math.max(totals[kind], clampInt(valueText, 0, 99));
    }
  }
  return totals;
}

function parseActionPointRules(item) {
  const totals = { bind: 0, drain: 0 };
  for (const rule of item.system?.rules ?? []) {
    if (rule?.key !== "ActionPoint" || rule.ignored) continue;
    totals.bind += resolveNumericValue(rule.boundValue, item.actor, item);
    totals.drain += resolveNumericValue(rule.drainedValue, item.actor, item);
  }
  return totals;
}

function resolveNumericValue(value, actor, item) {
  return Math.max(0, resolveSignedNumericValue(value, actor, item));
}

function resolveSignedNumericValue(value, actor, item) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "object") {
    if (Array.isArray(value.brackets)) {
      const fieldValue = resolveRuleFieldValue(value.field, actor, item);
      const bracket = value.brackets.find((entry) => {
        const start = Number(entry.start ?? 0);
        const end = Number(entry.end ?? Infinity);
        return fieldValue >= start && fieldValue <= end;
      });
      return resolveSignedNumericValue(bracket?.value ?? value.value ?? 0, actor, item);
    }
    if ("value" in value) return resolveSignedNumericValue(value.value, actor, item);
    return 0;
  }

  let formula = String(value).trim();
  formula = formula.replace(/{(actor|item)\|([^}]+)}/g, (_match, source, path) => {
    const object = source === "actor" ? actor : item;
    return String(Number(foundry.utils.getProperty(object, path)) || 0);
  });

  try {
    if (globalThis.Roll?.replaceFormulaData) {
      formula = Roll.replaceFormulaData(formula, { actor, item });
    }
    const result = globalThis.Roll?.safeEval ? Roll.safeEval(formula) : Number(formula);
    return Number.isFinite(Number(result)) ? Math.trunc(Number(result)) : 0;
  } catch {
    return 0;
  }
}

function resolveRuleFieldValue(field, actor, item) {
  if (!field) return 0;
  const [source, ...parts] = String(field).split("|");
  const path = parts.join("|");
  const object = source === "actor" ? actor : source === "item" ? item : null;
  return Number(foundry.utils.getProperty(object, path)) || 0;
}

function getChargeState(item) {
  const config = getChargeConfig(item);
  if (!config) return null;

  const stored = item.getFlag?.(MODULE_ID, CHARGE_FLAG) ?? {};
  const signature = getChargeSignature(config);
  const remaining = stored.signature === signature
    ? clampInt(stored.remaining ?? config.max, 0, config.max)
    : config.max;

  return {
    ...config,
    remaining,
    signature,
    frequencyLabel: getFrequencyLabel(config.frequency),
    resetLabel: getResetLabel(config.reset)
  };
}

function getChargeConfig(item) {
  if (!item?.actor) return null;
  const rule = (item.system?.rules ?? []).find((entry) => entry?.key === "PTUCharge" && !entry.ignored);
  if (rule) {
    const frequency = normalizeFrequency(rule.frequency) ?? normalizeFrequency(rule.reset) ?? "scene";
    return {
      frequency,
      reset: normalizeReset(rule.reset) ?? frequency,
      max: clampInt(rule.max, 1, 99),
      source: "rule"
    };
  }

  if (!game.settings.get(MODULE_ID, SETTINGS.autoDetect)) return null;
  return detectChargeConfigFromFrequency(item.system?.frequency);
}

function detectChargeConfigFromFrequency(frequencyText) {
  const text = String(frequencyText ?? "").trim();
  if (!text) return null;
  if (/\b(at[-\s]?will|eot|static|special)\b/i.test(text)) return null;

  const kind = normalizeFrequency(text);
  if (!kind) return null;

  const countMatch = /\b(?:scene|daily)\b\s*(?:x|\u00d7|times|\*)?\s*(\d+)\b/i.exec(text)
    ?? /\b(?:x|\u00d7)\s*(\d+)\b/i.exec(text)
    ?? /\b(\d+)\s*(?:\/|\s+per\s+)?\s*(?:scene|daily)\b/i.exec(text);

  return {
    frequency: kind,
    reset: kind,
    max: clampInt(countMatch?.[1] ?? 1, 1, 99),
    source: "frequency"
  };
}

function normalizeFrequency(value) {
  const text = String(value ?? "").toLowerCase();
  if (/\bscene\b/.test(text)) return "scene";
  if (/\bdaily\b/.test(text)) return "daily";
  return null;
}

function normalizeReset(value) {
  const text = String(value ?? "").toLowerCase();
  if (/\bscene\b/.test(text)) return "scene";
  if (/\bdaily\b/.test(text)) return "daily";
  if (/\bextended[-\s]?rest\b|\bextendedrest\b|\blong[-\s]?rest\b/.test(text)) return "extendedRest";
  return null;
}

function getChargeSignature(config) {
  return `${config.frequency}:${config.reset}:${config.max}`;
}

async function consumeCharge(item, amount = 1, { notify = false } = {}) {
  const state = getChargeState(item);
  if (!state) return true;
  if (!item.isOwner || state.remaining <= 0) {
    notifyNoCharges(item, state);
    return false;
  }

  const remaining = clampInt(state.remaining - amount, 0, state.max);
  await item.setFlag(MODULE_ID, CHARGE_FLAG, {
    remaining,
    max: state.max,
    frequency: state.frequency,
    reset: state.reset,
    signature: state.signature
  });

  if (notify) {
    ui.notifications.info(format("PTR_AP.Notify.ChargeUsed", {
      item: item.name,
      remaining,
      max: state.max,
      frequency: state.frequencyLabel
    }, `${item.name}: ${remaining}/${state.max} ${state.frequencyLabel} remaining.`));
  }

  return true;
}

async function adjustCharge(item, delta) {
  const state = getChargeState(item);
  if (!state || !item?.isOwner) return false;
  const remaining = clampInt(state.remaining + delta, 0, state.max);
  await item.setFlag(MODULE_ID, CHARGE_FLAG, {
    remaining,
    max: state.max,
    frequency: state.frequency,
    reset: state.reset,
    signature: state.signature
  });
  item.actor?.sheet?.render(false);
  return true;
}

async function resetItemCharge(item) {
  const state = getChargeState(item);
  if (!state || !item?.isOwner) return false;
  await item.setFlag(MODULE_ID, CHARGE_FLAG, {
    remaining: state.max,
    max: state.max,
    frequency: state.frequency,
    reset: state.reset,
    signature: state.signature
  });
  item.actor?.sheet?.render(false);
  return true;
}

function notifyNoCharges(item, state) {
  if (!state) return;
  ui.notifications.warn(format("PTR_AP.Notify.NoCharges", {
    item: item?.name ?? "Item",
    frequency: state.frequencyLabel
  }, `${item?.name ?? "Item"} has no ${state.frequencyLabel} charges remaining.`));
}

async function resetActorCharges(actor, resetType = "scene", { notify = false } = {}) {
  if (!actor?.isOwner) return 0;
  const isFullReset = resetType === "daily" || resetType === "extendedRest";
  let count = await resetActorChargePools(actor, isFullReset ? new Set(["scene", "daily", "extendedRest"]) : new Set(["scene"]));

  if (isFullReset) count += await clearActorDrainStates(actor);

  if (notify) {
    ui.notifications.info(format("PTR_AP.Notify.Reset", { name: actor.name, count }, `${actor.name}: ${count} charge pool(s) reset.`));
  }
  return count;
}

async function resetActorChargePools(actor, resetTypes) {
  let count = 0;

  for (const item of actor.items?.contents ?? []) {
    const state = getChargeState(item);
    if (!state || !resetTypes.has(state.reset)) continue;

    await item.setFlag(MODULE_ID, CHARGE_FLAG, {
      remaining: state.max,
      max: state.max,
      frequency: state.frequency,
      reset: state.reset,
      signature: state.signature
    });
    count += 1;
  }

  return count;
}

async function resetActorFullAp(actor, {
  bandage = "none",
  resetBind = true,
  resetDrain = true,
  resetTemp = true,
  restoreAp = true,
  resetDailyCharges = true,
  resetSceneCharges = false,
  notify = false
} = {}) {
  if (!actor?.isOwner || !hasApResource(actor)) return false;
  const resetTypes = new Set();
  if (resetDailyCharges) {
    resetTypes.add("daily");
    resetTypes.add("extendedRest");
  }
  if (resetSceneCharges) resetTypes.add("scene");
  if (resetTypes.size > 0) await resetActorChargePools(actor, resetTypes);
  if (resetBind) await clearActorBindStates(actor);
  if (resetDrain) await clearActorDrainStates(actor);
  if (resetBind || resetDrain) await resetActorManualAp(actor, resetBind && resetDrain ? "both" : resetBind ? "bind" : "drain");
  if (resetTemp) await resetActorManualAp(actor, "temp");
  if (bandage === "bandage" || bandage === "noBandage") await applyNewDayRecovery(actor, bandage);

  const ap = getActorApData(actor);
  if (restoreAp) await actor.update({ "system.ap.value": ap.usableMax });
  actor.sheet?.render(false);

  if (notify) {
    await notifyApChange(actor, "PTR_AP.Notify.FullReset", {
      name: actor.name,
      ap: restoreAp ? ap.usableMax : ap.available
    }, `${actor.name}: full AP reset completed.`, { chat: true });
  }
  return true;
}

async function clearActorDrainStates(actor) {
  let count = await clearActorItemApStates(actor, "drain");
  const actorState = getActorManualApState(actor);
  if (actorState.drain > 0) {
    actorState.drain = 0;
    await actor.setFlag(MODULE_ID, ACTOR_AP_FLAG, actorState);
    count += 1;
  }
  queueActorApClamp(actor);
  return count;
}

async function clearActorBindStates(actor) {
  let count = await clearActorItemApStates(actor, "bind");
  const actorState = getActorManualApState(actor);
  if (actorState.bind > 0) {
    actorState.bind = 0;
    await actor.setFlag(MODULE_ID, ACTOR_AP_FLAG, actorState);
    count += 1;
  }
  queueActorApClamp(actor);
  return count;
}

async function clearActorItemApStates(actor, kind) {
  let count = 0;
  for (const item of actor.items?.contents ?? []) {
    const config = getManualApConfig(item);
    const state = getManualApState(item, config);
    const shouldClearBind = kind === "bind" || kind === "both";
    const shouldClearDrain = kind === "drain" || kind === "both";
    if ((shouldClearBind && state.bindActive) || (shouldClearDrain && state.drainActive)) {
      if (shouldClearBind) state.bindActive = false;
      if (shouldClearDrain) state.drainActive = false;
      await item.setFlag(MODULE_ID, AP_STATE_FLAG, state);
      count += 1;
    }
  }
  return count;
}

async function applyNewDayRecovery(actor, bandage) {
  if (!actor?.isOwner) return false;
  const health = actor.system?.health;
  if (!health) return false;

  const injuries = clampInt(health.injuries, 0, 999);
  const currentHp = clampInt(health.value, 0, 99999);
  const healedInjuries = bandage === "bandage" ? 3 : 1;
  const nextInjuries = Math.max(0, injuries - healedInjuries);
  const nextMax = getHealthMaxForInjuries(actor, nextInjuries);
  const nextHp = bandage === "bandage"
    ? nextMax
    : Math.min(nextMax, currentHp + (getHealthTick(actor) * 3));

  await actor.update({
    "system.health.injuries": nextInjuries,
    "system.health.value": nextHp
  });
  return true;
}

function getHealthTick(actor) {
  const health = actor.system?.health ?? {};
  const tick = Number(health.tick);
  if (Number.isFinite(tick) && tick > 0) return Math.trunc(tick);

  const total = Number(health.total);
  if (Number.isFinite(total) && total > 0) return Math.floor(total / 10);

  const max = Number(health.max);
  if (Number.isFinite(max) && max > 0) return Math.floor(max / 10);

  return 0;
}

function getHealthMaxForInjuries(actor, injuries) {
  const health = actor.system?.health ?? {};
  const total = Number(health.total);
  const fallbackMax = clampInt(health.max, 0, 99999);
  if (!Number.isFinite(total) || total <= 0) return fallbackMax;

  const effectiveInjuries = actor.system?.modifiers?.hardened ? Math.min(injuries, 5) : injuries;
  return Math.max(0, Math.trunc(total * (1 - (effectiveInjuries / 10))));
}

async function promptNewDayOptions(actors) {
  const names = actors.map((actor) => actor.name).join(", ");
  const title = label("PTR_AP.Confirm.FullReset.Title", "Confirm Full AP Reset");
  const message = format("PTR_AP.Confirm.FullReset.Content", { names }, `Choose recovery options for ${names}.`);
  const content = renderNewDayOptionsContent(message);
  const confirmLabel = label("PTR_AP.Confirm", "Confirm");
  const cancelLabel = label("PTR_AP.Cancel", "Cancel");

  if (globalThis.Dialog) {
    return new Promise((resolve) => {
      let settled = false;
      const close = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      new Dialog({
        title,
        content,
        buttons: {
          confirm: {
            label: confirmLabel,
            callback: (html) => close(readNewDayOptions(html))
          },
          cancel: {
            label: cancelLabel,
            callback: () => close(null)
          }
        },
        default: "confirm",
        close: () => close(null)
      }).render(true);
    });
  }

  return globalThis.window?.confirm ? {
    bandage: window.confirm(message) ? "bandage" : "noBandage",
    resetBind: true,
    resetDrain: true,
    resetTemp: true,
    restoreAp: true,
    resetDailyCharges: true,
    resetSceneCharges: false
  } : null;
}

function renderNewDayOptionsContent(message) {
  return `
    <form class="ptr-ap-new-day-form">
      <p>${escapeHtml(message)}</p>
      <fieldset>
        <legend>${escapeHtml(label("PTR_AP.NewDay.Bandage", "Bandage applied?"))}</legend>
        <label><input type="radio" name="bandage" value="bandage"> ${escapeHtml(label("PTR_AP.NewDay.WithBandage", "Yes, with Bandage"))}</label>
        <label><input type="radio" name="bandage" value="noBandage" checked> ${escapeHtml(label("PTR_AP.NewDay.NoBandage", "No, without Bandage"))}</label>
      </fieldset>
      <fieldset>
        <legend>${escapeHtml(label("PTR_AP.NewDay.Options", "Options"))}</legend>
        ${renderNewDayCheckbox("resetBind", "PTR_AP.NewDay.ResetBind", "Reset Bind AP", true)}
        ${renderNewDayCheckbox("resetDrain", "PTR_AP.NewDay.ResetDrain", "Reset Drain AP", true)}
        ${renderNewDayCheckbox("resetTemp", "PTR_AP.NewDay.ResetTemp", "Reset Temporary AP", true)}
        ${renderNewDayCheckbox("restoreAp", "PTR_AP.NewDay.RestoreAP", "Restore AP to Maximum", true)}
        ${renderNewDayCheckbox("resetDailyCharges", "PTR_AP.NewDay.ResetDailyCharges", "Reset Daily Charges", true)}
        ${renderNewDayCheckbox("resetSceneCharges", "PTR_AP.NewDay.ResetSceneCharges", "Reset Scene Charges", false)}
      </fieldset>
    </form>
  `;
}

function renderNewDayCheckbox(name, key, fallback, checked) {
  return `<label><input type="checkbox" name="${name}" ${checked ? "checked" : ""}> ${escapeHtml(label(key, fallback))}</label>`;
}

function readNewDayOptions(html) {
  const root = html?.jquery ? html[0] : html?.[0] ?? html;
  const form = root?.querySelector?.(".ptr-ap-new-day-form") ?? root;
  const checked = (name) => !!form?.querySelector?.(`input[name="${name}"]`)?.checked;
  const bandage = form?.querySelector?.('input[name="bandage"]:checked')?.value ?? "noBandage";

  return {
    bandage,
    resetBind: checked("resetBind"),
    resetDrain: checked("resetDrain"),
    resetTemp: checked("resetTemp"),
    restoreAp: checked("restoreAp"),
    resetDailyCharges: checked("resetDailyCharges"),
    resetSceneCharges: checked("resetSceneCharges")
  };
}

async function confirmFullApReset(actors) {
  const names = actors.map((actor) => actor.name).join(", ");
  const title = label("PTR_AP.Confirm.FullReset.Title", "Confirm Full AP Reset");
  const message = format("PTR_AP.Confirm.FullReset.Content", { names }, `Reset AP, Bind, Drain, and charges for ${names}?`);
  const content = `<p>${escapeHtml(message)}</p>`;

  if (globalThis.Dialog?.confirm) {
    return !!(await Dialog.confirm({
      title,
      content,
      yes: () => true,
      no: () => false,
      defaultYes: false
    }));
  }

  return globalThis.window?.confirm ? window.confirm(message) : false;
}

function getSelectedTokenActors() {
  const actors = new Map();
  for (const token of globalThis.canvas?.tokens?.controlled ?? []) {
    const actor = token.actor;
    if (!isSupportedActor(actor) || !actor.isOwner) continue;
    actors.set(actor.uuid ?? actor.id, actor);
  }
  return Array.from(actors.values());
}

async function resetCombatantCharges(combat, resetType) {
  const actors = new Set((combat?.combatants?.contents ?? Array.from(combat?.combatants ?? []))
    .map((combatant) => combatant.actor)
    .filter((actor) => isSupportedActor(actor)));

  for (const actor of actors) {
    await resetActorCharges(actor, resetType);
  }
}

function refreshActorApAfterItemChange(item) {
  const actor = item?.actor;
  if (!actor || !hasApResource(actor) || !actor.isOwner || !game.settings.get(MODULE_ID, SETTINGS.clampAp)) return;
  queueActorApClamp(actor);
}

function queueActorApClamp(actor, preparedAp = null) {
  if (!actor || !hasApResource(actor) || !actor.isOwner || !game.settings.get(MODULE_ID, SETTINGS.clampAp)) return;
  window.setTimeout(() => {
    const ap = preparedAp ?? getActorApData(actor);
    if (Number(actor.system?.ap?.value ?? 0) <= ap.usableMax) return;
    actor.update({ "system.ap.value": ap.usableMax });
  }, 0);
}

async function spendAP(actor, amount = 1, { notify = true } = {}) {
  if (!actor?.isOwner || !hasApResource(actor)) return false;
  const cost = clampInt(amount, 0, 999);
  const ap = getActorApData(actor);
  if (cost > ap.available) {
    if (notify) {
      ui.notifications.warn(format("PTR_AP.Notify.ApClamped", { name: actor.name, usable: ap.available }, `${actor.name} can only use ${ap.available} AP after Bind and Drain.`));
    }
    return false;
  }

  await actor.update({ "system.ap.value": ap.available - cost });
  return true;
}

function getItemFromRow(actor, row) {
  const id = row?.dataset?.itemId;
  if (!id) return null;
  return actor.items.get(id) ?? actor.attacks?.get(id)?.item ?? null;
}

function getItemFromAction(actor, button) {
  const id = button?.dataset?.itemId ?? button?.closest?.("[data-item-id]")?.dataset?.itemId;
  if (!id) return null;
  return actor.items.get(id) ?? actor.attacks?.get(id)?.item ?? null;
}

function isSupportedActor(actor) {
  return !!actor && ["character", "pokemon"].includes(actor.type);
}

function hasApResource(actor) {
  return isSupportedActor(actor) && actor.system?.ap && actor.system.ap.value !== undefined && actor.system.ap.max !== undefined;
}

function normalizeKeywords(keywords) {
  if (!Array.isArray(keywords)) return [];
  return keywords.map((keyword) => {
    if (typeof keyword === "string") return keyword;
    return keyword?.value ?? keyword?.label ?? keyword?.name ?? "";
  }).filter(Boolean);
}

function getSheetRoot(app, html) {
  if (html instanceof HTMLElement) return html;
  if (html?.jquery) return html[0];
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (app?.element instanceof HTMLElement) return app.element;
  if (app?.element?.jquery) return app.element[0];
  if (app?.element?.[0] instanceof HTMLElement) return app.element[0];
  return document.getElementById(app?.id) ?? null;
}

function isPrimaryGM() {
  if (!game.user?.isGM) return false;
  const activeGMs = game.users.filter((user) => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return activeGMs[0]?.id === game.user.id;
}

function getFrequencyLabel(frequency) {
  const data = CHARGE_FREQUENCIES[frequency] ?? CHARGE_FREQUENCIES.scene;
  return label(data.labelKey, data.fallback);
}

function getResetLabel(reset) {
  const data = RESET_TYPES[reset] ?? RESET_TYPES.scene;
  return label(data.labelKey, data.fallback);
}

function getApKindLabel(kind) {
  if (kind === "temp") return label("PTR_AP.Temp", "Temp");
  if (kind === "bind") return label("PTR_AP.Bind", "Bind");
  if (kind === "drain") return label("PTR_AP.Drain", "Drain");
  return label("PTR_AP.BindDrainLabel", "Bind + Drain");
}

async function notifyApChange(actor, key, data, fallback, { chat = false } = {}) {
  const message = format(key, data, fallback);
  ui.notifications.info(message);

  if (!chat || !game.settings.get(MODULE_ID, SETTINGS.chatApChanges) || !globalThis.ChatMessage?.create) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker?.({ actor }) ?? { actor: actor.id },
    content: `<p>${escapeHtml(message)}</p>`
  });
}

function label(key, fallback) {
  const value = game.i18n.localize(key);
  return value && value !== key ? value : fallback;
}

function format(key, data, fallback) {
  const template = game.i18n.localize(key);
  if (!template || template === key) return fallback;
  return game.i18n.format(key, data);
}

function clampInt(value, min, max) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function warn(scope, error) {
  console.warn(`${MODULE_ID} | ${scope}`, error);
}

function exposeApi() {
  game.ptrApCharges = {
    getActorApData,
    getActorManualApState,
    getActorTemporaryAp,
    adjustActorManualAp,
    setActorManualAp,
    resetActorManualAp,
    resetActorFullAp,
    getChargeConfig,
    getChargeState,
    getManualApConfig,
    getManualApState,
    toggleManualApState,
    consumeCharge,
    adjustCharge,
    resetItemCharge,
    spendAP,
    resetActorCharges,
    detectChargeConfigFromFrequency
  };
}
