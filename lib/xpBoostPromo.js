import configDB from "../models/Config.js";

export function isPromoActive(cfg, now) {
  const s = new Date(cfg.startsAt).getTime();
  const e = new Date(cfg.endsAt).getTime();
  const t = new Date(new Date().toISOString()).getTime();

  return t >= s && t <= e && cfg.xpMultiplier > 0 && cfg.mode !== "OFF";
}

export function effectiveMultiplier(cfg, now = new Date()) {
  return isPromoActive(cfg, now) ? cfg.xpMultiplier : 1;
}

async function getPromotionConfig () {
    const cfg = await configDB.findOne({ key: "xpBoostPromo" });

    return cfg?.value;
}

export async function getEffectiveXP(storedXP, now = new Date()) {
  const cfg = await getPromotionConfig();
  const mult = effectiveMultiplier(cfg, now);

  return Math.floor(storedXP * mult); 
}
