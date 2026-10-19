// Presentation formatting, independent of game configuration and state.
export const fmt = (n) => {
  if (!isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1000) return (n % 1 ? n.toFixed(1) : String(n));
  const units = [[1e16, "京"], [1e12, "兆"], [1e8, "亿"], [1e4, "万"], [1e3, "千"]];
  const [scale, unit] = units.find(([scale]) => n >= scale);
  n /= scale;
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : String(Math.floor(n))) + unit;
};
export const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  if (s < 60) return s + "秒";
  if (s < 3600) return Math.floor(s / 60) + "分" + (s % 60 ? (s % 60) + "秒" : "");
  return Math.floor(s / 3600) + "时" + Math.floor(s % 3600 / 60) + "分";
};

