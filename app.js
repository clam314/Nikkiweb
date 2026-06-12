let LIBRARY = [];

const state = {
  characterId: null,
  costumeId: null,
  action: null,
  paused: false,
  query: "",
  loopByMode: {},
  presentationId: null,
  presentationLabel: null,
};

let player = null;
let playerLayer = null;
let loadId = 0;
let clipTimer = null;
let layerId = 0;
let demoId = 0;
let regionRecoveryId = 0;
let activeLoadingEntry = null;
const costumeCache = new Map();
const NORMAL_FIRE_ACTIONS = ["aim_fire", "fire"];
const SKILL_FIRE_ACTIONS = [
  "aim_skill_fire",
  "skill_fire",
  "aim_burst_fire",
  "burst_fire",
  "aim_fire_skill",
];
const FIRE_OVERLAY_ACTIONS = ["aim_fire_hair", "aim_fire_hip"];

const CLIP_LABELS = {
  action: "动作",
  angry: "生气",
  delight: "高兴",
  expression_0: "表情",
  go: "前进",
  no: "否定",
  pain_1: "受伤 1",
  pain_2: "受伤 2",
  panic: "慌张",
  sad: "伤心",
  sad_02: "伤心 2",
  shy: "害羞",
  shy_02: "害羞 2",
  smile: "微笑",
  smile_02: "微笑 2",
  special: "特殊",
  surprise: "惊讶",
  surprise_02: "惊讶 2",
  talk_start: "说话开始",
  talk_end: "说话结束",
  think: "思考",
  worry: "担心",
  cover_hit: "掩体受击",
  cover_reload: "掩体换弹",
  cover_stun: "掩体眩晕",
  to_cover: "转入掩体",
  to_aim: "转入瞄准",
  aim_fire: "瞄准开火",
  aim_fire_hair: "开火发丝",
  aim_fire_hip: "开火姿态",
  aim_hit: "瞄准受击",
  aim_skill_fire: "技能开火",
  skill_fire: "技能开火",
};

const WORD_LABELS = {
  aim: "瞄准",
  cover: "掩体",
  fire: "开火",
  hit: "受击",
  idle: "待机",
  reload: "换弹",
  skill: "技能",
  stun: "眩晕",
  talk: "说话",
  start: "开始",
  end: "结束",
  pain: "受伤",
  sad: "伤心",
  shy: "害羞",
  smile: "微笑",
  surprise: "惊讶",
};

const $ = (selector) => document.querySelector(selector);
const el = {
  title: $("#current-title"),
  hudCharacter: $("#hud-character"),
  hudAction: $("#hud-action"),
  characterList: $("#character-list"),
  costumeList: $("#costume-list"),
  actionList: $("#action-list"),
  libraryCount: $("#library-count"),
  actionCount: $("#action-count"),
  search: $("#search-input"),
  mount: $("#spine-player"),
  message: $("#message"),
  messageTitle: $("#message-title"),
  messageDetail: $("#message-detail"),
  hotzone: $("#menu-hotzone"),
  drawer: $("#drawer"),
  closeMenu: $("#close-menu"),
};

function activeCharacter() {
  return LIBRARY.find((item) => item.id === state.characterId) || LIBRARY[0];
}

function activeCostume() {
  const current = activeCharacter();
  return current?.costumes?.find((item) => item.id === state.costumeId) || current?.costumes?.[0];
}

function resetStateToCharacter(character) {
  state.characterId = character?.id || null;
  state.costumeId = character?.costumes?.[0]?.id || null;
  resetCombatLoops(character);
  state.action = mainLoopAction(character?.costumes?.[0]);
}

function randomCharacter() {
  const displayReady = LIBRARY.filter((character) =>
    character.costumes?.some((costume) => costume.mode === "stand"),
  );
  const pool = displayReady.length ? displayReady : LIBRARY;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function ensureState() {
  const hasCharacter = LIBRARY.some((item) => item.id === state.characterId);
  if (!hasCharacter && LIBRARY.length) resetStateToCharacter(LIBRARY[0]);
  if (!activeCostume() && activeCharacter()?.costumes?.length) {
    const costume = activeCharacter().costumes[0];
    state.costumeId = costume.id;
    state.action = mainLoopAction(costume);
  }
}

function sourceLabel(source) {
  if (source === "nikke-db") return "Nikke-db";
  return source || "资源";
}

function runtimeLabel(runtime) {
  return String(runtime || "4.0").startsWith("4.1") ? "4.1" : "4.0";
}

function runtimeByLabel(label) {
  return label === "4.1" ? window.spine41 : window.spine;
}

function runtimeCandidates(costume) {
  const primary = runtimeLabel(costume?.runtime);
  return [primary, primary === "4.1" ? "4.0" : "4.1"];
}

function cloneViewport(viewport) {
  return {
    padLeft: "7%",
    padRight: "7%",
    padTop: "8%",
    padBottom: "5%",
    ...(viewport || {}),
    animations: {
      ...(viewport?.animations || {}),
    },
  };
}

function searchableText(character) {
  return [
    character.name,
    character.displayName,
    character.manufacturer,
    character.source,
    ...(character.aliases || []),
    ...(character.costumes || []).flatMap((item) => [item.id, item.name, item.mode]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filteredCharacters() {
  const query = state.query.trim().toLowerCase();
  return LIBRARY.filter((item) => {
    const queryOk = !query || searchableText(item).includes(query);
    return queryOk;
  });
}

function showMessage(title, detail) {
  el.messageTitle.textContent = title;
  el.messageDetail.textContent = detail || "";
  el.message.classList.add("visible");
}

function hideMessage() {
  el.message.classList.remove("visible");
}

function mainLoopAction(costume = activeCostume()) {
  const actions = costume?.actions || [];
  const preferred = [costume?.defaultAction, "idle", "cover_idle", "aim_idle"].filter(Boolean);
  return preferred.find((action) => actions.includes(action)) || preferred[0] || actions[0] || null;
}

function resetCombatLoops(character = activeCharacter()) {
  state.loopByMode = {};
  for (const costume of character?.costumes || []) {
    if (costume.mode) state.loopByMode[costume.mode] = mainLoopAction(costume);
  }
}

function currentLoopAction(costume = activeCostume()) {
  const actions = costume?.actions || [];
  const loop = state.loopByMode?.[costume?.mode];
  return loop && actions.includes(loop) ? loop : mainLoopAction(costume);
}

function setCurrentLoopAction(action, costume = activeCostume()) {
  if (!action || !costume?.mode) return;
  if ((costume.actions || []).includes(action)) state.loopByMode[costume.mode] = action;
}

function resetCurrentLoopAction(costume = activeCostume()) {
  const loop = mainLoopAction(costume);
  setCurrentLoopAction(loop, costume);
  return loop;
}

function clipLabel(action) {
  if (CLIP_LABELS[action]) return CLIP_LABELS[action];
  return action
    .split("_")
    .filter(Boolean)
    .map((part) => WORD_LABELS[part] || (/^\d+$/.test(part) ? ` ${Number(part)}` : part))
    .join("");
}

function shouldExposeClip(action, costume) {
  if (!action || action === mainLoopAction(costume)) return false;
  if (action.startsWith("to_")) return false;
  if (action === "cover_stun" && (costume?.actions || []).includes("cover_hit")) return false;
  if (costume?.mode === "aim" && (action === "aim_x" || action === "aim_y")) return false;
  return true;
}

function visibleClips(costume = activeCostume()) {
  return (costume?.actions || []).filter((action) => shouldExposeClip(action, costume));
}

function costumeByMode(mode, character = activeCharacter()) {
  return character?.costumes?.find((item) => item.mode === mode);
}

function presentationPresets(character = activeCharacter()) {
  const hasStand = !!costumeByMode("stand", character);
  const hasCover = !!costumeByMode("cover", character);
  const hasAim = !!costumeByMode("aim", character);
  const presets = [];

  if (hasStand) presets.push({ id: "portrait", label: "立绘展示" });
  if (hasCover && hasAim) presets.push({ id: "fire_reload", label: "开火循环展示" });
  return presets;
}

function transitionAction(from, to) {
  if (!from || !to || from.id === to.id) return null;
  if (from.mode === "cover" && to.mode === "aim") return "to_aim";
  if (from.mode === "aim" && to.mode === "cover") return "to_cover";
  return null;
}

function transitionRevealDelayMs(action, entry) {
  const padding = action === "to_cover" ? 190 : action === "to_aim" ? 140 : 100;
  return Math.max(240, animationDuration(action, entry) * 1000 + padding);
}

function compositeClip(action, costume = activeCostume()) {
  const actions = costume?.actions || [];
  if (action === "cover_hit" && actions.includes("cover_stun")) {
    return { intro: "cover_hit", hold: "cover_stun" };
  }
  return null;
}

function shouldLoopClip(action) {
  if (!action) return false;
  if (action.includes("reload")) return false;
  if (action.endsWith("_hit") || action.includes("_hit_")) return false;
  return true;
}

function returnLoopAfterClip(action, costume = activeCostume(), loopBefore = currentLoopAction(costume)) {
  if (!action) return mainLoopAction(costume);
  if (action.includes("reload")) return mainLoopAction(costume);
  if (action.endsWith("_hit") || action.includes("_hit_")) {
    return loopBefore || mainLoopAction(costume);
  }
  return loopBefore || mainLoopAction(costume);
}

function setHud() {
  const current = activeCharacter();
  const currentCostume = activeCostume();
  const action = state.action || mainLoopAction(currentCostume) || "-";
  el.title.textContent = `${current?.displayName || "-"} / ${currentCostume?.name || "-"}`;
  el.hudCharacter.textContent = current?.displayName || "-";
  el.hudAction.textContent =
    state.presentationLabel ||
    (action === mainLoopAction(currentCostume) ? currentCostume?.name || action : clipLabel(action));
}

function makeButton(label, className, isActive, onClick, title) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = `${className}${isActive ? " active" : ""}`;
  node.textContent = label;
  if (title) node.title = title;
  node.addEventListener("click", onClick);
  return node;
}

function chooseCharacter(character) {
  stopPresentation();
  ++loadId;
  clearCostumeCache();
  resetStateToCharacter(character);
  renderMenu();
  loadCurrent();
}

function renderCharacters() {
  const list = filteredCharacters();
  el.libraryCount.textContent = `${list.length}/${LIBRARY.length}`;
  el.characterList.replaceChildren();

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "没有匹配的人物";
    el.characterList.appendChild(empty);
    return;
  }

  for (const item of list) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = `character-button${item.id === state.characterId ? " active" : ""}`;

    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    image.src = item.thumbnail;
    image.addEventListener("error", () => {
      image.removeAttribute("src");
      image.classList.add("missing-image");
    });

    const copy = document.createElement("span");
    copy.className = "character-copy";

    const title = document.createElement("strong");
    title.textContent = item.displayName || item.name;

    const meta = document.createElement("small");
    meta.textContent = `${sourceLabel(item.source)} / ${item.costumes.length} 姿态`;

    copy.append(title, meta);
    node.append(image, copy);
    node.addEventListener("click", () => chooseCharacter(item));
    el.characterList.appendChild(node);
  }
}

function renderCostumes() {
  const current = activeCharacter();
  el.costumeList.replaceChildren();
  for (const item of current.costumes) {
    el.costumeList.appendChild(
      makeButton(item.name, "pill-button", item.id === state.costumeId, () => chooseCostume(item)),
    );
  }
}

function renderActions() {
  const presets = presentationPresets();
  el.actionCount.textContent = `${presets.length}`;
  el.actionList.replaceChildren();

  if (!presets.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "没有可展示的姿态";
    el.actionList.appendChild(empty);
    return;
  }

  for (const preset of presets) {
    el.actionList.appendChild(
      makeButton(
        preset.label,
        "pill-button action-button",
        preset.id === state.presentationId,
        () => startPresentation(preset.id),
        preset.label,
      ),
    );
  }
}

function renderMenu() {
  ensureState();
  setHud();
  renderCharacters();
  renderCostumes();
  renderActions();
}

function clearClipTimer() {
  if (clipTimer) {
    window.clearTimeout(clipTimer);
    clipTimer = null;
  }
}

function stopPresentation() {
  demoId += 1;
  clearClipTimer();
  state.presentationId = null;
  state.presentationLabel = null;
}

function beginPresentation(id, label) {
  clearClipTimer();
  demoId += 1;
  state.presentationId = id;
  state.presentationLabel = label;
  setHud();
  renderActions();
  return demoId;
}

function isActiveDemo(token) {
  return token === demoId;
}

function scheduleDemo(token, delay, callback) {
  if (!isActiveDemo(token)) return;
  clearClipTimer();
  clipTimer = window.setTimeout(() => {
    clipTimer = null;
    if (isActiveDemo(token)) callback();
  }, Math.max(80, delay));
}

function hasAction(costume, action) {
  return !!action && (costume?.actions || []).includes(action);
}

function firstAction(costume, candidates) {
  return candidates.find((action) => hasAction(costume, action)) || null;
}

function firstMatchingAction(costume, matcher) {
  return (costume?.actions || []).find((action) => matcher(action)) || null;
}

function uniqueActions(actions) {
  return actions.filter((action, index) => action && actions.indexOf(action) === index);
}

function animationObject(instance, action) {
  return instance?.skeleton?.data?.findAnimation?.(action) || null;
}

function animationViewport(instance, action) {
  const animation = animationObject(instance, action);
  if (!animation || typeof instance?.calculateAnimationViewport !== "function") return null;

  const viewport = {};
  try {
    instance.calculateAnimationViewport(animation, viewport);
  } catch (error) {
    console.debug(error);
    return null;
  }

  const values = [viewport.x, viewport.y, viewport.width, viewport.height];
  if (values.some((value) => !Number.isFinite(value)) || viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }
  return viewport;
}

function unionViewport(items) {
  const viewports = items.filter(Boolean);
  if (!viewports.length) return null;

  const minX = Math.min(...viewports.map((item) => item.x));
  const minY = Math.min(...viewports.map((item) => item.y));
  const maxX = Math.max(...viewports.map((item) => item.x + item.width));
  const maxY = Math.max(...viewports.map((item) => item.y + item.height));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function mergeViewportIfReasonable(base, extra) {
  if (!base) return extra;
  if (!extra) return base;

  const merged = unionViewport([base, extra]);
  if (!merged) return base;

  const widthOk = merged.width <= base.width * 1.9;
  const heightOk = merged.height <= base.height * 1.75;
  return widthOk && heightOk ? merged : base;
}

function isSkillFireAction(action) {
  return /(^|_)aim_.*(skill|burst).*fire|(^|_)(skill|burst).*fire|fire.*(skill|burst)/i.test(
    action,
  );
}

function normalFireAction(aim) {
  return (
    firstAction(aim, NORMAL_FIRE_ACTIONS) ||
    firstMatchingAction(
      aim,
      (action) =>
        action.includes("fire") &&
        !action.includes("hit") &&
        !action.includes("skill") &&
        !action.includes("burst") &&
        !FIRE_OVERLAY_ACTIONS.includes(action),
    )
  );
}

function skillFireAction(aim) {
  return firstAction(aim, SKILL_FIRE_ACTIONS) || firstMatchingAction(aim, isSkillFireAction);
}

function fireOverlayActions(aim) {
  return FIRE_OVERLAY_ACTIONS.filter((action) => hasAction(aim, action));
}

function combatFireStages(aim) {
  const normal = normalFireAction(aim);
  const skill = skillFireAction(aim);
  return [
    normal && {
      action: normal,
      kind: "normal",
      overlays: fireOverlayActions(aim),
    },
    skill &&
      skill !== normal && {
        action: skill,
        kind: "skill",
        overlays: [],
      },
  ].filter(Boolean);
}

function combatViewportActions(cover, aim) {
  const fireStages = combatFireStages(aim);
  return {
    coverBase: uniqueActions([mainLoopAction(cover), "cover_reload", "to_aim"]),
    aimBase: uniqueActions([mainLoopAction(aim), "to_cover"]),
    aimFire: uniqueActions(fireStages.flatMap((stage) => [stage.action, ...(stage.overlays || [])])),
  };
}

function buildCombatViewport(coverEntry, aimEntry) {
  const cover = coverEntry?.costume;
  const aim = aimEntry?.costume;
  if (!cover || !aim) return null;

  const actions = combatViewportActions(cover, aim);
  const coverBase = actions.coverBase.map((action) => animationViewport(coverEntry.player, action));
  const aimBase = actions.aimBase.map((action) => animationViewport(aimEntry.player, action));
  const fireBounds = actions.aimFire.map((action) => animationViewport(aimEntry.player, action));
  const base = unionViewport([...coverBase, ...aimBase]);
  const merged = mergeViewportIfReasonable(base, unionViewport(fireBounds));
  if (!merged) return null;

  return {
    ...merged,
    padLeft: "10%",
    padRight: "16%",
    padTop: "9%",
    padBottom: "7%",
    animations: {},
  };
}

function setEntryViewport(entry, viewport) {
  if (!entry?.player || !viewport) return;
  entry.player.config.viewport = cloneViewport(viewport);
}

async function ensureCostumeReady(costume, token) {
  if (!costume || !isActiveDemo(token)) return null;

  const entry = ensureCostumeEntry(costume, activeCharacter());
  try {
    await entry.promise;
  } catch (error) {
    if (isActiveDemo(token)) showMessage("载入失败", error.message || "战斗姿态载入失败");
    return null;
  }

  return isActiveDemo(token) && entry.ready ? entry : null;
}

async function prepareCombatScene(token) {
  const cover = costumeByMode("cover");
  const aim = costumeByMode("aim");
  if (!cover || !aim || !isActiveDemo(token)) return null;

  const character = activeCharacter();
  const pendingCostumes = [cover, aim].filter((costume) => {
    const entry = costumeCache.get(costumeCacheKey(character, costume));
    return !entry?.ready;
  });
  if (pendingCostumes.length) {
    showMessage(
      "Loading",
      `${character?.displayName || character?.name || "角色"} / 正在载入开火循环资源`,
    );
  }

  const [coverEntry, aimEntry] = await Promise.all([
    ensureCostumeReady(cover, token),
    ensureCostumeReady(aim, token),
  ]);
  if (!coverEntry || !aimEntry || !isActiveDemo(token)) return null;

  const viewport = buildCombatViewport(coverEntry, aimEntry);
  if (viewport) {
    setEntryViewport(coverEntry, viewport);
    setEntryViewport(aimEntry, viewport);
  }

  return { cover, aim, viewport };
}

function applyPresentationLoop(action, costume = activeCostume()) {
  if (!action || !player) return null;
  const entry = setAnimationInternal(action, true, 1);
  if (!entry) return null;
  state.action = action;
  setCurrentLoopAction(action, costume);
  setHud();
  renderActions();
  return entry;
}

function applyPresentationClip(action) {
  if (!action || !player) return null;
  const entry = setAnimationInternal(action, false, 1);
  if (!entry) return null;
  state.action = action;
  setHud();
  renderActions();
  return entry;
}

function clipDurationMs(action, entry, extra = 160) {
  return animationDuration(action, entry) * 1000 + extra;
}

function disposeInstance(instance) {
  if (!instance) return;
  for (const method of ["dispose", "stopRendering", "stop"]) {
    if (typeof instance[method] === "function") {
      try {
        instance[method]();
      } catch (error) {
        console.debug(error);
      }
    }
  }
}

function dispose() {
  clearClipTimer();
  clearCostumeCache();
  player = null;
  playerLayer = null;
  el.mount.replaceChildren();
}

function createPlayerLayer() {
  const layer = document.createElement("div");
  layer.id = `spine-layer-${++layerId}`;
  layer.className = "spine-layer pending";
  el.mount.appendChild(layer);
  return layer;
}

function costumeCacheKey(character, costume) {
  return `${character?.id || "unknown"}::${costume?.id || "unknown"}`;
}

function activeCacheKey(costume = activeCostume()) {
  return costumeCacheKey(activeCharacter(), costume);
}

function setInstancePaused(instance, paused) {
  if (!instance) return;
  if (paused && typeof instance.pause === "function") instance.pause();
  if (!paused && typeof instance.play === "function") instance.play();
  if (instance.animationState) instance.animationState.timeScale = paused ? 0 : 1;
}

function disposeCacheEntry(entry) {
  if (!entry) return;
  entry.disposed = true;
  if (activeLoadingEntry === entry) activeLoadingEntry = null;
  disposeInstance(entry.player);
  entry.layer?.remove();
  if (entry.player === player) {
    player = null;
    playerLayer = null;
  }
}

function clearCostumeCache(keepCharacterId = null) {
  for (const [key, entry] of costumeCache) {
    if (keepCharacterId && entry.characterId === keepCharacterId) continue;
    disposeCacheEntry(entry);
    costumeCache.delete(key);
  }
}

function playerConfig(item, callbacks = {}) {
  const config = {
    atlasUrl: item.atlas,
    skelUrl: item.skeleton,
    animation: mainLoopAction(item),
    alpha: true,
    backgroundColor: "#00000000",
    defaultMix: 0.25,
    mipmaps: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    showLoading: false,
    showControls: false,
    viewport: cloneViewport(item.viewport),
    success: callbacks.success,
    error: callbacks.error,
  };

  if (item.skin) config.skin = item.skin;
  return config;
}

function skinCandidates(costume) {
  const candidates = [costume?.skin, undefined, "default", "00", "acc", "bg", "weapon_1"];
  return candidates.filter((skin, index) => candidates.indexOf(skin) === index);
}

function costumeWithSkin(costume, skin) {
  if (skin === undefined) {
    const { skin: _skin, ...rest } = costume;
    return rest;
  }
  return { ...costume, skin };
}

function isRegionAtlasError(message) {
  return /Region not found in atlas/i.test(message || "");
}

function isSpineLoadError(message) {
  return /Region not found in atlas|Could not load skeleton binary|Offset is outside the bounds|name cannot be null|This character does not have/i.test(
    message || "",
  );
}

function isRuntimeMismatchError(message) {
  return /Region not found in atlas:\s*(null|undefined)|region attachment:\s*(null|undefined)|Offset is outside the bounds|name cannot be null/i.test(
    message || "",
  );
}

function recoverRegionAtlasError(message) {
  const loadingEntry = activeLoadingEntry && !activeLoadingEntry.ready ? activeLoadingEntry : null;
  if (loadingEntry) return true;

  const costume = loadingEntry?.costume || activeCostume();
  if (!costume || costume.regionRecoveryTried) return false;

  costume.regionRecoveryTried = true;
  delete costume.skin;
  const key = loadingEntry?.key || activeCacheKey(costume);
  const entry = costumeCache.get(key);
  if (entry) {
    disposeCacheEntry(entry);
    costumeCache.delete(key);
  }

  const token = ++regionRecoveryId;
  window.setTimeout(() => {
    if (token !== regionRecoveryId) return;
    showMessage("正在修复贴图", "这套资源的 skin 和 atlas 不匹配，正在切换兼容加载方式");
    loadCostume(costume, {
      updateState: !loadingEntry,
      action: mainLoopAction(costume),
    });
  }, 80);
  console.warn("Recovering Spine atlas region error", message);
  return true;
}

function ensureCostumeEntry(costume, character = activeCharacter()) {
  const key = costumeCacheKey(character, costume);
  const cached = costumeCache.get(key);
  if (cached) return cached;

  const layer = createPlayerLayer();
  const entry = {
    key,
    characterId: character?.id || null,
    costume,
    layer,
    player: null,
    usedRuntime: null,
    ready: false,
    failed: false,
    error: null,
    disposed: false,
    promise: null,
  };

  costumeCache.set(key, entry);

  entry.promise = new Promise((resolve, reject) => {
    const runtimes = runtimeCandidates(costume);
    const skins = skinCandidates(costume);

    const fail = (error) => {
      entry.failed = true;
      entry.error = error;
      layer.remove();
      costumeCache.delete(key);
      reject(error);
      if (activeLoadingEntry === entry) {
        window.setTimeout(() => {
          if (activeLoadingEntry === entry) activeLoadingEntry = null;
        }, 0);
      }
    };

    const tryLoad = (runtimeIndex = 0, skinIndex = 0) => {
      if (entry.disposed) {
        resolve(entry);
        return;
      }

      const runtimeName = runtimes[runtimeIndex];
      const runtime = runtimeByLabel(runtimeName);
      if (!runtime?.SpinePlayer) {
        if (runtimeIndex + 1 < runtimes.length) {
          tryLoad(runtimeIndex + 1, 0);
          return;
        }

        fail(new Error(`这套资源需要 Spine ${runtimeName}，但页面没有加载对应播放器`));
        return;
      }

      const skin = skins[skinIndex];
      const item = costumeWithSkin({ ...costume, runtime: runtimeName }, skin);

      const retryOrFail = (reason, instance = null) => {
        const text = typeof reason === "string" ? reason : reason?.message || "资源载入失败";
        disposeInstance(instance);
        layer.replaceChildren();

        if (isRuntimeMismatchError(text) && runtimeIndex + 1 < runtimes.length) {
          tryLoad(runtimeIndex + 1, 0);
          return;
        }

        if (skinIndex + 1 < skins.length) {
          tryLoad(runtimeIndex, skinIndex + 1);
          return;
        }

        if (runtimeIndex + 1 < runtimes.length) {
          tryLoad(runtimeIndex + 1, 0);
          return;
        }

        fail(new Error(text));
      };

      try {
        activeLoadingEntry = entry;
        new runtime.SpinePlayer(
          layer.id,
          playerConfig(item, {
            success: (instance) => {
              if (activeLoadingEntry === entry) activeLoadingEntry = null;
              if (entry.disposed) {
                disposeInstance(instance);
                resolve(entry);
                return;
              }

              entry.player = instance;
              entry.ready = true;
              entry.usedSkin = skin;
              entry.usedRuntime = runtimeName;
              costume.runtime = runtimeName;
              syncActions(instance, costume);
              setInstanceAnimation(instance, mainLoopAction(costume), true, 1);
              if (entry.key !== activeCacheKey()) setInstancePaused(instance, true);
              resolve(entry);
            },
            error: (instance, reason) => {
              retryOrFail(reason, instance);
            },
          }),
        );
      } catch (error) {
        retryOrFail(error);
      }
    };

    tryLoad();
  });

  return entry;
}

function syncActions(instance, costume = activeCostume()) {
  const animations =
    instance?.skeleton?.data?.animations?.map((item) => item.name).filter(Boolean) || [];
  if (!animations.length) return;

  const changed = (costume.actions || []).join("|") !== animations.join("|");
  costume.actions = animations;

  if (costume.id === state.costumeId && !animations.includes(state.action)) {
    state.action = mainLoopAction(costume);
  }
  if (costume.mode && !animations.includes(state.loopByMode?.[costume.mode])) {
    state.loopByMode[costume.mode] = mainLoopAction(costume);
  }
  if (changed) renderMenu();
}

function revealCostumeEntry(entry, options = {}) {
  if (!entry?.ready) return;
  if (options.viewport) setEntryViewport(entry, options.viewport);
  for (const cached of costumeCache.values()) {
    const active = cached === entry;
    cached.layer.classList.toggle("pending", !active);
    if (cached.player) setInstancePaused(cached.player, !active);
  }

  player = entry.player;
  playerLayer = entry.layer;
  const action = options.action || currentLoopAction(entry.costume);
  state.costumeId = entry.costume.id;
  state.action = action;
  state.paused = false;
  setCurrentLoopAction(action, entry.costume);
  setInstanceAnimation(player, action, true, 1);
  renderMenu();
  hideMessage();
}

function clearAuxiliaryTracks(instance = player) {
  const animationState = instance?.animationState;
  if (!animationState) return;
  for (let track = 1; track <= 4; track += 1) {
    try {
      animationState.clearTrack?.(track);
    } catch (error) {
      console.debug(error);
    }
  }
}

function setInstanceAnimation(instance, action, loop, speed = 1) {
  if (!instance || !action) return null;

  clearAuxiliaryTracks(instance);
  let entry = null;
  if (typeof instance.setAnimation === "function") {
    entry = instance.setAnimation(action, loop);
  } else if (instance.animationState) {
    entry = instance.animationState.setAnimation(0, action, loop);
  }

  if (typeof instance.play === "function") instance.play();
  if ("speed" in instance) instance.speed = speed;
  if (instance.animationState) instance.animationState.timeScale = speed;
  return entry;
}

function setAuxiliaryAnimation(instance, track, action, loop = true, speed = 1) {
  const animationState = instance?.animationState;
  const animation = animationObject(instance, action);
  if (!animationState || !animation || track <= 0) return null;

  let entry = null;
  if (typeof animationState.setAnimationWith === "function") {
    entry = animationState.setAnimationWith(track, animation, loop);
  } else if (typeof animationState.setAnimation === "function") {
    entry = animationState.setAnimation(track, action, loop);
  }

  if (typeof instance.play === "function") instance.play();
  if ("speed" in instance) instance.speed = speed;
  animationState.timeScale = speed;
  return entry;
}

function setAnimationInternal(action, loop, speed = 1) {
  const entry = setInstanceAnimation(player, action, loop, speed);
  if (!entry) return null;
  state.paused = false;
  return entry;
}

function animationDuration(action, entry) {
  const duration =
    entry?.animation?.duration ||
    player?.skeleton?.data?.findAnimation?.(action)?.duration ||
    0.8;
  return Math.max(0.2, duration);
}

function queueLoop(action) {
  if (!action || !player) return;
  if (typeof player.addAnimation === "function") {
    player.addAnimation(action, true, 0);
  } else if (player.animationState?.addAnimation) {
    player.animationState.addAnimation(0, action, true, 0);
  }
}

function playLoop(action = mainLoopAction()) {
  if (!player || !action) return;

  try {
    clearClipTimer();
    setAnimationInternal(action, true, 1);
    state.action = action;
    setCurrentLoopAction(action);
    setHud();
    renderActions();
  } catch (error) {
    showMessage("动作不可用", action);
  }
}

function playClip(action, options = {}) {
  if (!player || !action) return;

  try {
    clearClipTimer();
    const costume = activeCostume();
    const loopBefore = currentLoopAction(costume);
    const speed = options.speed || 1;
    const composite = compositeClip(action, costume);
    const shouldLoop = options.loop ?? shouldLoopClip(action);

    if (composite) {
      setAnimationInternal(composite.intro, false, speed);
      queueLoop(composite.hold);
      setCurrentLoopAction(composite.hold, costume);
      state.action = action;
      setHud();
      renderActions();
      return;
    }

    if (shouldLoop) {
      setAnimationInternal(action, true, speed);
      setCurrentLoopAction(action, costume);
      state.action = action;
      setHud();
      renderActions();
      return;
    }

    const entry = setAnimationInternal(action, false, speed);
    const returnLoop = options.returnLoop || returnLoopAfterClip(action, costume, loopBefore);
    if (options.queueLoop !== false && returnLoop && returnLoop !== action) queueLoop(returnLoop);

    state.action = action;
    setHud();
    renderActions();

    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      clipTimer = null;
      if (typeof options.after === "function") {
        options.after();
        return;
      }
      if (returnLoop) {
        state.action = returnLoop;
        setCurrentLoopAction(returnLoop, costume);
      }
      setHud();
      renderActions();
    };

    if (entry && !options.minDuration) {
      entry.listener = {
        complete: finish,
      };
    }

    const durationMs = (animationDuration(action, entry) / speed) * 1000 + 160;
    clipTimer = window.setTimeout(finish, Math.max(durationMs, options.minDuration || 0));
  } catch (error) {
    showMessage("片段不可用", action);
  }
}

function selectCostume(item, options = {}) {
  clearClipTimer();
  const action = options.action || resetCurrentLoopAction(item);
  loadCostume(item, { updateState: true, action });
}

function chooseCostume(item) {
  stopPresentation();
  if (item.id === state.costumeId && player) {
    playLoop(resetCurrentLoopAction(item));
    return;
  }

  const action = resetCurrentLoopAction(item);
  if (playCombatTransition(item, { action })) return;

  selectCostume(item, { action });
}

function playCombatTransition(target, options = {}) {
  const current = activeCostume();
  const transition = transitionAction(current, target);
  if (!transition || !player || !(current?.actions || []).includes(transition)) return false;

  try {
    clearClipTimer();
    const entry = setAnimationInternal(transition, false, 1);
    state.action = transition;
    setHud();
    renderActions();

    const durationMs = transitionRevealDelayMs(transition, entry);
    loadCostume(target, {
      updateState: false,
      action: options.action || currentLoopAction(target),
      revealAt: performance.now() + durationMs,
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function switchPresentationCostume(mode, token, action = null) {
  const target = mode === "current" ? activeCostume() : costumeByMode(mode);
  if (!target || !isActiveDemo(token)) return false;

  const options = action && typeof action === "object" ? action : {};
  const requestedAction = action && typeof action === "object" ? null : action;
  const nextAction = options.action || requestedAction || currentLoopAction(target) || mainLoopAction(target);
  const viewport = options.viewport || null;
  if (target.id === state.costumeId && player) {
    const entry = costumeCache.get(activeCacheKey(target));
    if (viewport) setEntryViewport(entry, viewport);
    applyPresentationLoop(nextAction, target);
    return isActiveDemo(token);
  }

  const current = activeCostume();
  const transition = transitionAction(current, target);
  if (transition && player && hasAction(current, transition)) {
    const entry = setAnimationInternal(transition, false, 1);
    state.action = transition;
    setHud();
    renderActions();
    const durationMs = transitionRevealDelayMs(transition, entry);
    await loadCostume(target, {
      updateState: false,
      action: nextAction,
      viewport,
      revealAt: performance.now() + durationMs,
    });
  } else {
    await loadCostume(target, { updateState: false, action: nextAction, viewport });
  }

  return isActiveDemo(token) && target.id === state.costumeId && !!player;
}

function startPresentation(id) {
  const preset = presentationPresets().find((item) => item.id === id);
  if (!preset) return;

  const token = beginPresentation(preset.id, preset.label);
  if (id === "portrait") runPortraitPresentation(token);
  if (id === "cover") runCoverPresentation(token);
  if (id === "aim") runAimPresentation(token);
  if (id === "combat") runCombatPresentation(token);
  if (id === "fire_reload") runFireReloadPresentation(token);
  if (id === "current") runCurrentPresentation(token);
}

async function runPortraitPresentation(token) {
  const target = costumeByMode("stand") || activeCostume();
  if (!target) return;
  const action = portraitMainAction(target);
  if (!(await switchPresentationCostume(target.mode || "current", token, action))) return;
  playPortraitSeries(token, () => runPortraitPresentation(token));
}

async function runCurrentPresentation(token) {
  const target = activeCostume();
  if (!target) return;
  const action = target.mode === "stand" ? portraitMainAction(target) : mainLoopAction(target);
  if (!(await switchPresentationCostume(target.mode || "current", token, action))) return;
  if (target.mode === "stand") playPortraitSeries(token, () => runCurrentPresentation(token));
}

async function runCoverPresentation(token) {
  const cover = costumeByMode("cover");
  if (!cover) return;
  if (!(await switchPresentationCostume("cover", token, mainLoopAction(cover)))) return;
  playCoverSeries(token, () => runCoverPresentation(token));
}

async function runAimPresentation(token) {
  const aim = costumeByMode("aim");
  if (!aim) return;
  if (!(await switchPresentationCostume("aim", token, mainLoopAction(aim)))) return;
  playAimSeries(token, () => runAimPresentation(token));
}

async function runCombatPresentation(token) {
  const scene = await prepareCombatScene(token);
  if (!scene) return;
  const { cover, viewport } = scene;

  if (!(await switchPresentationCostume("cover", token, { action: mainLoopAction(cover), viewport }))) return;
  applyPresentationLoop(mainLoopAction(cover), cover);
  scheduleDemo(token, 800, () => {
    playFirePhase(token, () => {
      playReturnCoverPhase(token, () => {
        scheduleDemo(token, 900, () => runCombatPresentation(token));
      }, 720, viewport);
    }, viewport);
  });
}

async function runFireReloadPresentation(token) {
  const scene = await prepareCombatScene(token);
  if (!scene) return;
  const { cover, viewport } = scene;

  if (!(await switchPresentationCostume("cover", token, { action: mainLoopAction(cover), viewport }))) return;
  applyPresentationLoop(mainLoopAction(cover), cover);
  scheduleDemo(token, 650, () => playFireReloadCycle(token, viewport));
}

function playFireReloadCycle(token, viewport = null) {
  if (!isActiveDemo(token)) return;
  const cover = costumeByMode("cover");
  const aim = costumeByMode("aim");
  if (!cover || !aim) return;

  playFirePhase(token, () => {
    playReturnCoverPhase(token, () => {
      playReloadPhase(token, () => playFireReloadCycle(token, viewport));
    }, 520, viewport);
  }, viewport);
}

function combatFireHoldMs(stage, entry) {
  const durationMs = animationDuration(stage.action, entry) * 1000;
  if (stage.kind === "skill") return Math.min(3400, Math.max(1900, durationMs * 2.6));
  return Math.min(1800, Math.max(1150, durationMs * 4.2));
}

function applyCombatFireStage(stage, aim) {
  const entry = applyPresentationLoop(stage.action, aim);
  if (!entry) return null;

  for (const [index, overlay] of (stage.overlays || []).entries()) {
    setAuxiliaryAnimation(player, index + 1, overlay, true, 1);
  }
  return entry;
}

function playFireStages(token, aim, actions, index, next) {
  if (!isActiveDemo(token)) return;
  const stage = actions[index];
  if (!stage) {
    scheduleDemo(token, 260, next);
    return;
  }

  const entry = applyCombatFireStage(stage, aim);
  scheduleDemo(token, combatFireHoldMs(stage, entry), () => {
    playFireStages(token, aim, actions, index + 1, next);
  });
}

function playFirePhase(token, next, viewport = null) {
  if (!isActiveDemo(token)) return;
  const aim = costumeByMode("aim");
  if (!aim) return;

  switchPresentationCostume("aim", token, { action: mainLoopAction(aim), viewport }).then((aimReady) => {
    if (!aimReady) return;
    const idle = mainLoopAction(aim);
    const fireStages = combatFireStages(aim);

    applyPresentationLoop(idle, aim);
    scheduleDemo(token, 220, () => {
      if (!fireStages.length) {
        scheduleDemo(token, 900, next);
        return;
      }
      playFireStages(token, aim, fireStages, 0, next);
    });
  });
}

function playReturnCoverPhase(token, next, holdMs = 720, viewport = null) {
  if (!isActiveDemo(token)) return;
  const cover = costumeByMode("cover");
  if (!cover) return;

  switchPresentationCostume("cover", token, { action: mainLoopAction(cover), viewport }).then((coverReady) => {
    if (!coverReady) return;
    applyPresentationLoop(mainLoopAction(cover), cover);
    scheduleDemo(token, holdMs, next);
  });
}

function playReloadPhase(token, next) {
  if (!isActiveDemo(token)) return;
  const cover = costumeByMode("cover") || activeCostume();
  const idle = mainLoopAction(cover);
  const reload = firstAction(cover, ["cover_reload"]);

  if (!reload) {
    applyPresentationLoop(idle, cover);
    scheduleDemo(token, 600, next);
    return;
  }

  const entry = applyPresentationClip(reload);
  queueLoop(idle);
  scheduleDemo(token, clipDurationMs(reload, entry, 120), () => {
    applyPresentationLoop(idle, cover);
    scheduleDemo(token, 480, next);
  });
}

function playAimSeries(token, next) {
  if (!isActiveDemo(token)) return;
  const aim = activeCostume();
  const idle = mainLoopAction(aim);
  const fire = firstAction(aim, ["aim_fire", "aim_skill_fire", "skill_fire"]);
  const hit = firstAction(aim, ["aim_hit"]);

  applyPresentationLoop(idle, aim);
  scheduleDemo(token, 850, () => {
    if (!fire) {
      scheduleDemo(token, 900, next);
      return;
    }

    applyPresentationLoop(fire, aim);
    scheduleDemo(token, 1500, () => {
      if (!hit) {
        applyPresentationLoop(idle, aim);
        scheduleDemo(token, 700, next);
        return;
      }

      const entry = applyPresentationClip(hit);
      queueLoop(fire);
      scheduleDemo(token, clipDurationMs(hit, entry, 180), () => {
        applyPresentationLoop(fire, aim);
        scheduleDemo(token, 850, () => {
          applyPresentationLoop(idle, aim);
          scheduleDemo(token, 650, next);
        });
      });
    });
  });
}

function portraitMainAction(costume) {
  return (
    firstAction(costume, [
      "action",
      "special",
      "delight",
      "smile",
      "smile_02",
      "shy",
      "shy_02",
      "surprise",
      "surprise_02",
      "idle",
    ]) || mainLoopAction(costume)
  );
}

function playPortraitSeries(token, next) {
  if (!isActiveDemo(token)) return;
  const costume = activeCostume();
  const main = portraitMainAction(costume);
  applyPresentationLoop(main, costume);
}

function playCoverSeries(token, next) {
  if (!isActiveDemo(token)) return;
  const cover = activeCostume();
  const idle = mainLoopAction(cover);
  const hit = firstAction(cover, ["cover_hit"]);
  const stun = firstAction(cover, ["cover_stun"]);
  const reload = firstAction(cover, ["cover_reload"]);

  const playReload = () => {
    if (!isActiveDemo(token)) return;
    if (!reload) {
      applyPresentationLoop(idle, cover);
      scheduleDemo(token, 900, next);
      return;
    }

    const entry = applyPresentationClip(reload);
    queueLoop(idle);
    scheduleDemo(token, clipDurationMs(reload, entry, 180), () => {
      applyPresentationLoop(idle, cover);
      scheduleDemo(token, 850, next);
    });
  };

  applyPresentationLoop(idle, cover);
  scheduleDemo(token, 900, () => {
    if (!hit) {
      playReload();
      return;
    }

    const entry = applyPresentationClip(hit);
    scheduleDemo(token, clipDurationMs(hit, entry, 100), () => {
      if (stun) {
        applyPresentationLoop(stun, cover);
        scheduleDemo(token, 1100, () => {
          applyPresentationLoop(idle, cover);
          scheduleDemo(token, 450, playReload);
        });
      } else {
        applyPresentationLoop(idle, cover);
        scheduleDemo(token, 450, playReload);
      }
    });
  });
}

async function loadCostume(costume, options = {}) {
  if (!costume) {
    showMessage("没有人物资源", "请等待 Nikke-db 索引载入完成");
    return;
  }

  const token = ++loadId;
  const character = activeCharacter();
  const entry = ensureCostumeEntry(costume, character);

  state.paused = false;
  if (options.updateState !== false) {
    state.costumeId = costume.id;
    state.action = options.action || currentLoopAction(costume);
    renderMenu();
  }

  if (!entry.ready && options.showLoading !== false) {
    showMessage(
      options.loadingTitle || "Loading",
      options.loadingDetail || `${character.displayName || character.name} / 正在载入${costume.name}`,
    );
  } else if (entry.ready) {
    hideMessage();
  }

  try {
    await entry.promise;
    if (token !== loadId) return;

    const reveal = () => {
      if (token !== loadId) return;
      revealCostumeEntry(entry, { action: options.action, viewport: options.viewport });
    };

    const delay = Math.max(0, options.revealAt ? options.revealAt - performance.now() : 0);
    if (delay) {
      return new Promise((resolve) => {
        window.setTimeout(() => {
          reveal();
          resolve(entry);
        }, delay);
      });
    }
    reveal();
    return entry;
  } catch (error) {
    if (token !== loadId) return;
    showMessage("载入失败", error.message || "播放器初始化失败");
    return null;
  }
}

function loadCurrent() {
  ensureState();
  loadCostume(activeCostume(), { updateState: true });
}

function togglePause() {
  if (!player) return;
  state.paused = !state.paused;

  if (typeof player.pause === "function" && typeof player.play === "function") {
    state.paused ? player.pause() : player.play();
  } else if (player.animationState) {
    player.animationState.timeScale = state.paused ? 0 : 1;
  }
}

function toggleMenu() {
  document.body.classList.toggle("menu-pinned");
  document.body.classList.toggle("menu-open", document.body.classList.contains("menu-pinned"));
}

function closeMenu() {
  document.body.classList.remove("menu-open", "menu-pinned");
}

function isNikkeDbCharacter(entry) {
  return entry?.id && /^c\d/.test(entry.id) && !/\bnpc\b/i.test(entry.name || "");
}

function nikkeDbExpectedResourcePaths(id, mode) {
  if (mode === "stand") return [`l2d/${id}/${id}_00.skel`, `l2d/${id}/${id}_00.atlas`];
  if (mode === "cover") {
    return [`l2d/${id}/cover/${id}_cover_00.skel`, `l2d/${id}/cover/${id}_cover_00.atlas`];
  }
  if (mode === "aim") {
    return [`l2d/${id}/aim/${id}_aim_00.skel`, `l2d/${id}/aim/${id}_aim_00.atlas`];
  }
  return [];
}

function buildNikkeDbAvailability(entries, tree) {
  const paths = new Set((tree?.tree || []).map((item) => item.path).filter(Boolean));
  if (!paths.size || tree?.truncated) return null;

  const availableModes = new Map();
  for (const entry of entries.filter(isNikkeDbCharacter)) {
    const modes = new Set();
    for (const mode of ["stand", "cover", "aim"]) {
      const expected = nikkeDbExpectedResourcePaths(entry.id, mode);
      if (expected.length && expected.every((path) => paths.has(path))) modes.add(mode);
    }
    if (modes.size) availableModes.set(entry.id, modes);
  }
  return availableModes;
}

async function loadNikkeDbAvailability(entries) {
  const treeUrl = window.NIKKE_DB_CONFIG?.treeUrl;
  if (!treeUrl) return null;

  try {
    const response = await fetch(treeUrl, { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return buildNikkeDbAvailability(entries, await response.json());
  } catch (error) {
    console.warn("Nikke-db resource tree failed", error);
    return null;
  }
}

function mergeRemoteCharacters(entries, availableModes = null) {
  const buildCharacter = window.NIKKE_BUILD_REMOTE_CHARACTER;
  if (typeof buildCharacter !== "function") return 0;

  const existing = new Set(LIBRARY.map((item) => item.id));
  const seenRemote = new Set();
  const remoteCharacters = entries
    .filter(isNikkeDbCharacter)
    .filter((entry) => {
      if (existing.has(entry.id) || seenRemote.has(entry.id)) return false;
      seenRemote.add(entry.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => buildCharacter(entry, availableModes))
    .filter(Boolean);

  LIBRARY = [...LIBRARY, ...remoteCharacters];
  return remoteCharacters.length;
}

async function loadNikkeDbIndex() {
  const indexUrl = window.NIKKE_DB_CONFIG?.indexUrl;
  if (!indexUrl) return;

  try {
    const response = await fetch(indexUrl, { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const entries = await response.json();
    const availableModes = await loadNikkeDbAvailability(entries);
    const before = LIBRARY.length;
    const added = mergeRemoteCharacters(entries, availableModes);

    if (!before && LIBRARY.length) {
      resetStateToCharacter(randomCharacter());
      renderMenu();
      loadCurrent();
      return;
    }

    if (added) renderMenu();
  } catch (error) {
    console.warn("Nikke-db index failed", error);
    if (!LIBRARY.length) showMessage("Nikke-db 加载失败", error.message || "无法读取远程索引");
  }
}

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "m") toggleMenu();
  if (event.key === "Escape") closeMenu();
  if (event.code === "Space") {
    event.preventDefault();
    togglePause();
  }
  if (event.key.toLowerCase() === "r") loadCurrent();
});

el.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderCharacters();
});

el.hotzone.addEventListener("pointerenter", () => {
  document.body.classList.add("menu-open");
});

el.hotzone.addEventListener("click", () => {
  toggleMenu();
});

el.closeMenu.addEventListener("click", closeMenu);

el.drawer.addEventListener("pointerleave", () => {
  if (!document.body.classList.contains("menu-pinned")) {
    document.body.classList.remove("menu-open");
  }
});

window.addEventListener("error", (event) => {
  const message = event.message || "";
  if (activeLoadingEntry && !activeLoadingEntry.ready && isSpineLoadError(message)) {
    event.preventDefault();
    return;
  }

  if (isRegionAtlasError(message) && recoverRegionAtlasError(message)) {
    event.preventDefault();
    return;
  }

  if (/spine|atlas|skel|png|asset/i.test(message)) {
    showMessage("播放器错误", event.message);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason?.message || String(event.reason || "");
  if (activeLoadingEntry && !activeLoadingEntry.ready && isSpineLoadError(reason)) {
    event.preventDefault();
    return;
  }

  if (isRegionAtlasError(reason) && recoverRegionAtlasError(reason)) {
    event.preventDefault();
    return;
  }

  if (/spine|atlas|skel|png|asset|nikke/i.test(reason)) showMessage("播放器错误", reason);
});

ensureState();
if (LIBRARY.length) {
  renderMenu();
  loadCurrent();
} else {
  showMessage("Loading", "正在载入 Nikke-db 人物索引");
}
loadNikkeDbIndex();
