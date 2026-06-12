const NIKKE_DB_RAW =
  "https://raw.githubusercontent.com/Nikke-db/Nikke-db.github.io/main";

function nikkeDb(path) {
  return `${NIKKE_DB_RAW}/${path}`;
}

function nikkeDbSprite(id) {
  return nikkeDb(`images/sprite/si_${id}_00_s.png`);
}

const NIKKE_DB_MISSING_LIVE2D_IDS = new Set([
  "c053",
  "c081",
  "c122",
  "c211",
  "c320",
  "c340",
  "c342",
  "c913",
  "c9999",
]);

function nikkeDbRuntime(id, mode, version) {
  return String(version || "4.0").startsWith("4.1") ? "4.1" : "4.0";
}

function nikkeDbSkin(id, mode) {
  if (id === "c010_01" || id === "c907_01") return "00";
  if (mode === "cover" && id === "c220") return "weapon_1";

  const accSkins = new Set([
    "c220",
    "c102",
    "c940",
    "c101_01",
    "c350",
    "c810",
    "c810_01",
    "c321",
  ]);
  const bgSkins = new Set(["c351", "c070_02", "c810_02"]);

  if (mode === "stand" && accSkins.has(id)) return "acc";
  if (mode === "stand" && bgSkins.has(id)) return "bg";
  return "default";
}

function nikkeDbLive2d(entry, mode, label) {
  const id = entry.id;
  const modeConfig = {
    stand: {
      suffix: `${id}_00`,
      folder: `l2d/${id}`,
      action: "idle",
    },
    cover: {
      suffix: `${id}_cover_00`,
      folder: `l2d/${id}/cover`,
      action: "cover_idle",
    },
    aim: {
      suffix: `${id}_aim_00`,
      folder: `l2d/${id}/aim`,
      action: "aim_idle",
    },
  }[mode];

  return {
    id: `${id}-${mode}`,
    name: label,
    mode,
    runtime: nikkeDbRuntime(id, mode, entry.version),
    skin: nikkeDbSkin(id, mode),
    skeleton: nikkeDb(`${modeConfig.folder}/${modeConfig.suffix}.skel`),
    atlas: nikkeDb(`${modeConfig.folder}/${modeConfig.suffix}.atlas`),
    defaultAction: modeConfig.action,
    actions: [modeConfig.action],
    viewport: {
      padLeft: "5%",
      padRight: "5%",
      padTop: "6%",
      padBottom: "4%",
    },
  };
}

function nikkeDbAvailableModes(entry, availableModes) {
  if (availableModes instanceof Map) return availableModes.get(entry.id) || new Set();
  if (NIKKE_DB_MISSING_LIVE2D_IDS.has(entry.id)) return new Set();
  return new Set(["stand", "cover", "aim"]);
}

function buildNikkeDbCharacter(entry, availableModes = null) {
  const modes = nikkeDbAvailableModes(entry, availableModes);
  const costumes = [
    modes.has("stand") && nikkeDbLive2d(entry, "stand", "立绘"),
    modes.has("cover") && nikkeDbLive2d(entry, "cover", "掩体"),
    modes.has("aim") && nikkeDbLive2d(entry, "aim", "瞄准"),
  ].filter(Boolean);

  if (!costumes.length) return null;

  return {
    id: entry.id,
    name: entry.name,
    displayName: entry.name,
    aliases: [entry.id, entry.name],
    source: "nikke-db",
    manufacturer: "Nikke-db",
    thumbnail: nikkeDbSprite(entry.id),
    costumes,
  };
}

window.NIKKE_DB_CONFIG = {
  raw: NIKKE_DB_RAW,
  indexUrl: nikkeDb("js/json/l2d.json"),
  treeUrl: "https://api.github.com/repos/Nikke-db/Nikke-db.github.io/git/trees/main?recursive=1",
};

window.NIKKE_BUILD_REMOTE_CHARACTER = buildNikkeDbCharacter;
