const canvas = document.getElementById("hexCanvas");
const mainCtx = canvas.getContext("2d");
const HEX_SIZE = 30;
const SNAP_THRESHOLD = 0.8;


let width,
  height,
  isDrawing = false,
  currentPattern = [],
  confirmedPatterns = [];
let usedSpotsGlobal = new Set(),
  usedEdgesGlobal = new Set(),
  mousePos = {
    x: 0,
    y: 0
  };

const PLACE_DIRS = ["east", "northeast", "northwest", "west", "southwest", "southeast"];
let placingEntry = null;
let placingDirIdx = 1;
let hoveredPatternIdx = -1; // index into confirmedPatterns
let undoHistory = []; // stack of pattern indices that were placed (for undo)

function resize() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  draw();
}
window.addEventListener("resize", resize);
resize();

let toastTimer = null;

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}

function updatePatternDisplay(path, label) {
  const el = document.getElementById("patternDisplay");
  if (!el) return;

  if (!path || path.length < 2) {
    el.classList.remove("visible");
    return;
  }

  const result = pathToAngleSig(path);
  if (!result) {
    el.classList.remove("visible");
    return;
  }

  const numberLabel = parseNumber(result.sig);
  const name = numberLabel || PATTERN_NAMES[result.sig] || "Unknown Pattern";

  el.innerHTML = `
    <div class="pd-name">${name}</div>
    <div class="pd-sig">${result.startDir} &middot; ${result.sig || "&mdash;"}</div>
  `;
  el.classList.add("visible");
  positionTooltip(el);
}

function positionTooltip(el) {
  const OFFSET = 16;
  const mx = mousePos.x, my = mousePos.y;
  const W = window.innerWidth, H = window.innerHeight;
  const elW = el.offsetWidth || 180;
  const elH = el.offsetHeight || 56;

  // Default: bottom-right of cursor
  let x = mx + OFFSET;
  let y = my + OFFSET;

  // Flip left if too close to right edge
  if (x + elW > W - 8) x = mx - elW - OFFSET;
  // Flip up if too close to bottom edge
  if (y + elH > H - 8) y = my - elH - OFFSET;

  el.style.transform = `translate(${x}px, ${y}px)`;
}

const DIR_DELTAS = [{
    dq: 1,
    dr: 0
  }, // 0: E
  {
    dq: 1,
    dr: -1
  }, // 1: NE
  {
    dq: 0,
    dr: -1
  }, // 2: NW
  {
    dq: -1,
    dr: 0
  }, // 3: W
  {
    dq: -1,
    dr: 1
  }, // 4: SW
  {
    dq: 0,
    dr: 1
  }, // 5: SE
];
const DIR_NAMES = [
  "east",
  "northeast",
  "northwest",
  "west",
  "southwest",
  "southeast",
];

function getDir(a, b) {
  const dq = b.q - a.q,
    dr = b.r - a.r;
  for (let i = 0; i < 6; i++)
    if (DIR_DELTAS[i].dq === dq && DIR_DELTAS[i].dr === dr) return i;
  return -1;
}

function pathToAngleSig(path) {
  if (path.length < 2) return null;
  const startDirIdx = getDir(path[0], path[1]);
  if (startDirIdx < 0) return null;
  let curDir = startDirIdx,
    sig = "";
  for (let i = 2; i < path.length; i++) {
    const nextDir = getDir(path[i - 1], path[i]);
    if (nextDir < 0) return null;
    const turn = (nextDir - curDir + 6) % 6;
    switch (turn) {
      case 0:
        sig += "w";
        break;
      case 1:
        sig += "q";
        break;
      case 2:
        sig += "a";
        break;
      case 4:
        sig += "d";
        break;
      case 5:
        sig += "e";
        break;
      default:
        return null;
    }
    curDir = nextDir;
  }
  return {
    sig,
    startDir: DIR_NAMES[startDirIdx]
  };
}

function parseNumber(angleSig) {
  if (typeof angleSig !== "string") return null;

  const isPositive = angleSig.startsWith("aqaa");
  const isNegative = angleSig.startsWith("dedd");

  if (!isPositive && !isNegative) return null;

  let output = 0;
  const payload = angleSig.slice(4);

  for (const char of payload) {
    switch (char) {
      case "a":
        output *= 2;
        break;
      case "q":
        output += 5;
        break;
      case "w":
        output += 1;
        break;
      case "e":
        output += 10;
        break;
      case "d":
        output /= 2;
        break;
    }
  }

  if (isNegative) output *= -1;
  return `Numerical Reflection (${output})`;
}

// Encode a number into a Numerical Reflection angle signature
// Mirrors the logic in Hexcessible's Number.java

const _encodeCache = new Map();

// Lookup for n 1–2000 using precomputed table, BFS fallback otherwise
function _bfsEncode(n) {
  if (n === 0) return "";
  // Use precomputed table for 1–2000 (NUMBERS is 0-indexed, NUMBERS[0] = sig for 1)
  if (n >= 1 && n <= 2000 && typeof NUMBERS !== "undefined") {
    return NUMBERS[n - 1] ?? null;
  }
  // BFS fallback (for sub-components outside table range that are still small)
  const visited = new Map([[0, ""]]);
  const queue = [{ val: 0, sig: "" }];
  const cap = n * 2 + 30;
  for (let i = 0; i < queue.length; i++) {
    const { val, sig } = queue[i];
    for (const [next, ch] of [[val*2,"a"],[val+5,"q"],[val+1,"w"],[val+10,"e"],[val/2,"d"]]) {
      if (next < 0 || next > cap || !Number.isFinite(next) || visited.has(next)) continue;
      const ns = sig + ch;
      if (next === n) return ns;
      visited.set(next, ns);
      queue.push({ val: next, sig: ns });
    }
  }
  return visited.has(n) ? visited.get(n) : null;
}

// Decompose n as a * b + rem, where a,b,rem are all <= 2000
// Used for n in range 2001–99999
function _decomposeSmall(n) {
  // Try factor pairs from most-balanced outward for shortest result
  let best = null;
  for (let a = Math.floor(Math.sqrt(n)); a >= 2; a--) {
    const b = Math.floor(n / a);
    const rem = n - a * b;
    if (b > 2000 || rem > 2000) continue;
    const aSig = _bfsEncode(a);
    const bSig = _bfsEncode(b);
    if (aSig === null || bSig === null) continue;
    // a * b + rem  =>  aqaa{a} | aqaa{b} | waqaw | [aqaa{rem} | waaw]
    let sig = "aqaa" + aSig + "|aqaa" + bSig + "|waqaw";
    if (rem > 0) {
      const remSig = _bfsEncode(rem);
      if (remSig === null) continue;
      sig += "|aqaa" + remSig + "|waaw";
    }
    if (best === null || sig.length < best.length) best = sig;
    // Once remainder is 0 and we have a balanced pair, can't do better
    if (rem === 0) break;
  }
  return best;
}

function encodeInt(n) {
  if (n < 0) return null;
  if (n === 0) return "";
  if (_encodeCache.has(n)) return _encodeCache.get(n);

  let result;
  if (n <= 2000) {
    result = _bfsEncode(n);
  } else if (n <= 99999) {
    result = _decomposeSmall(n);
  } else {
    result = _encodeLarge(n);
  }

  _encodeCache.set(n, result);
  return result;
}

// For n > 99999: decompose as a^b * c + d
// a,b,c must be <= 2000 (BFS-safe); d may be up to 99999 (handled by _decomposeSmall)
function _encodeLarge(n) {
  let bestSig = null;
  for (let a = 2; a <= 16; a++) {
    const b = Math.floor(Math.log(n) / Math.log(a));
    if (b < 1 || b > 2000) continue;
    const aPowB = Math.round(Math.pow(a, b));
    if (aPowB <= 0 || !isFinite(aPowB) || aPowB > n) continue;
    const c = Math.floor(n / aPowB);
    const d = n - aPowB * c;
    if (c > 2000 || d > 99999) continue;
    const aSig = _bfsEncode(a);
    const bSig = _bfsEncode(b);
    if (aSig === null || bSig === null) continue;
    let sig = "aqaa" + aSig + "|aqaa" + bSig + "|wedew";
    if (c !== 1) {
      const cSig = _bfsEncode(c);
      if (cSig === null) continue;
      sig += "|aqaa" + cSig + "|waqaw";
    }
    if (d !== 0) {
      // d <= 99999, safe to call encodeInt which uses _decomposeSmall (not _encodeLarge)
      const dSig = encodeInt(d);
      if (dSig === null) continue;
      // dSig may itself be multi-part; flatten it
      sig += "|" + dSig + "|waaw";
    }
    if (bestSig === null || sig.length < bestSig.length) bestSig = sig;
  }
  return bestSig;
}

// Returns array of pattern entries for a number — may be multiple (decomposed)
function numberToPatternEntries(num) {
  if (!isFinite(num)) return null;
  const prefix = num >= 0 ? "aqaa" : "dedd";
  const abs = Math.abs(num);

  // Fraction: try denom 2–32
  if (abs !== Math.floor(abs)) {
    for (let denom = 2; denom <= 32; denom++) {
      const numer = Math.round(abs * denom);
      if (Math.abs(abs - numer / denom) < 0.001) {
        const numPayload = encodeInt(numer);
        const denPayload = encodeInt(denom);
        if (numPayload !== null && denPayload !== null) {
          const numPrefix = num >= 0 ? "aqaa" : "dedd";
          return [
            { sig: numPrefix + numPayload, name: "Numerical Reflection (" + numer + ")" },
            { sig: "aqaa" + denPayload,    name: "Numerical Reflection (" + denom + ")" },
            { sig: "wdedw", name: "Division Distillation" },
          ];
        }
      }
    }
  }

  // Integer (direct or large decomposition)
  const intAbs = Math.round(abs);
  const payload = encodeInt(intAbs);
  if (!payload && payload !== "") return null;

  // Single pattern
  const parts = payload.split("|");
  if (parts.length === 1) {
    return [{ sig: prefix + payload, name: "Numerical Reflection (" + num + ")" }];
  }

  // Multi-pattern decomposition
  return parts.map(s => {
    const numMatch = parseNumber(s);
    const nameMatch = PATTERN_NAMES[s];
    return { sig: s, name: numMatch || nameMatch || s };
  });
}

function formatPatternLine(path) {
  const result = pathToAngleSig(path);
  if (!result) return "# (unreadable pattern)";

  const numberLabel = parseNumber(result.sig);
  if (numberLabel) {
    return `${numberLabel} ${result.startDir} ${result.sig}`;
  }

  const name = PATTERN_NAMES[result.sig];
  if (name) {
    return `(${name}) ${result.startDir} ${result.sig}`;
  }

  return `(Unknown) ${result.startDir} ${result.sig}`;
}

function exportPatternData() {
  if (confirmedPatterns.length === 0) {
    showToast("Nothing to export — draw something first!");
    return;
  }
  showExportPopup();
}

function showExportPopup() {
  const overlay = document.createElement("div");
  overlay.id = "exportOverlay";
  overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        `;

  const popup = document.createElement("div");
  popup.style.cssText = `
          background: #2a2a2a;
          border: 2px solid #8b5cf6;
          border-radius: 8px;
          padding: 24px;
          color: #fff;
          font-family: monospace;
          min-width: 300px;
        `;

  const title = document.createElement("h3");
  title.textContent = "Export Pattern Data";
  title.style.cssText = "margin: 0 0 20px 0; text-align: center; color: #8b5cf6;";
  popup.appendChild(title);

  const toggleContainer = document.createElement("div");
  toggleContainer.style.cssText = "display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;";

  const state = {
    patternName: true,
    direction: true,
    angles: true
  };

  const preview = document.createElement("div");
  preview.style.cssText = `
          background: #1a1a1a;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 12px;
          margin-bottom: 20px;
          font-size: 12px;
          color: #aaa;
          min-height: 20px;
        `;

  const updatePreview = () => {
    const parts = [];
    if (state.patternName) {
      if (state.direction || state.angles) {
        parts.push("(Mind's Reflection)");
      } else {
        parts.push("Mind's Reflection");
      }
    }
    if (state.direction) parts.push("northeast");
    if (state.angles) parts.push("qaq");

    preview.textContent = parts.length > 0 ? parts.join(" ") : "(select at least one option)";
  };

  const createToggle = (label, key) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `
            flex: 1;
            padding: 10px;
            border: 2px solid #8b5cf6;
            background: #8b5cf6;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            font-family: monospace;
            font-size: 12px;
            transition: all 0.2s;
          `;
    btn.onclick = () => {
      state[key] = !state[key];
      btn.style.background = state[key] ? "#8b5cf6" : "transparent";
      btn.style.color = state[key] ? "white" : "#8b5cf6";
      updatePreview();
    };
    return btn;
  };

  toggleContainer.appendChild(createToggle("Pattern Name", "patternName"));
  toggleContainer.appendChild(createToggle("Direction", "direction"));
  toggleContainer.appendChild(createToggle("Angles", "angles"));
  popup.appendChild(toggleContainer);

  updatePreview();
  popup.appendChild(preview);

  const saveLabel = document.createElement("div");
  saveLabel.textContent = "Save to:";
  saveLabel.style.cssText = "margin: 20px 0 10px 0; font-size: 14px; color: #8b5cf6;";
  popup.appendChild(saveLabel);

  const saveMethodContainer = document.createElement("div");
  saveMethodContainer.style.cssText = "display: flex; gap: 10px; margin-bottom: 20px;";

  let saveMethod = "clipboard";

  const clipboardBtn = document.createElement("button");
  clipboardBtn.textContent = "Clipboard";
  clipboardBtn.style.cssText = `
          flex: 1;
          padding: 10px;
          border: 2px solid #8b5cf6;
          background: #8b5cf6;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          font-family: monospace;
        `;

  const fileBtn = document.createElement("button");
  fileBtn.textContent = "File";
  fileBtn.style.cssText = `
          flex: 1;
          padding: 10px;
          border: 2px solid #8b5cf6;
          background: transparent;
          color: #8b5cf6;
          border-radius: 4px;
          cursor: pointer;
          font-family: monospace;
        `;

  clipboardBtn.onclick = () => {
    saveMethod = "clipboard";
    clipboardBtn.style.background = "#8b5cf6";
    clipboardBtn.style.color = "white";
    fileBtn.style.background = "transparent";
    fileBtn.style.color = "#8b5cf6";
  };

  fileBtn.onclick = () => {
    saveMethod = "file";
    fileBtn.style.background = "#8b5cf6";
    fileBtn.style.color = "white";
    clipboardBtn.style.background = "transparent";
    clipboardBtn.style.color = "#8b5cf6";
  };

  saveMethodContainer.appendChild(clipboardBtn);
  saveMethodContainer.appendChild(fileBtn);
  popup.appendChild(saveMethodContainer);

  const doneBtn = document.createElement("button");
  doneBtn.textContent = "Done";
  doneBtn.style.cssText = `
          width: 100%;
          padding: 12px;
          border: 2px solid #10b981;
          background: #10b981;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          font-family: monospace;
          font-size: 14px;
          font-weight: bold;
        `;
  doneBtn.onclick = () => {
    const text = generateExportText(state);

    if (saveMethod === "clipboard") {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          showToast("Copied to clipboard!");
          document.body.removeChild(overlay);
        })
        .catch(() => {
          showToast("Failed to copy");
          document.body.removeChild(overlay);
        });
    } else {
      const blob = new Blob([text], {
        type: "text/plain"
      });
      const link = document.createElement("a");
      link.download = `hex_patterns_${Date.now()}.txt`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      showToast("Saved to file!");
      document.body.removeChild(overlay);
    }
  };
  popup.appendChild(doneBtn);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };

  const escapeHandler = (e) => {
    if (e.key === "Escape") {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      window.removeEventListener("keydown", escapeHandler);
    }
  };
  window.addEventListener("keydown", escapeHandler);
}

function generateExportText(state) {
  const lines = confirmedPatterns.map((p) => {
    const result = pathToAngleSig(p.path);
    if (!result) return "(unreadable pattern)";

    const parts = [];
    const onlyPatternName = state.patternName && !state.direction && !state.angles;

    if (state.patternName) {
      const numberLabel = parseNumber(result.sig);
      if (numberLabel) {
        parts.push(numberLabel);
      } else {
        const name = PATTERN_NAMES[result.sig];
        if (onlyPatternName) {
          parts.push(name || "Unknown");
        } else {
          parts.push(name ? `(${name})` : "(Unknown)");
        }
      }
    }

    if (state.direction) {
      parts.push(result.startDir);
    }

    if (state.angles) {
      parts.push(result.sig);
    }

    return parts.join(" ");
  });

  return lines.join("\n");
}

function saveAsImage() {
  if (confirmedPatterns.length === 0) return;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  confirmedPatterns.forEach((p) =>
    p.path.forEach((coord) => {
      const pos = hexToPixel(coord.q, coord.r);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    }),
  );
  const pad = 50,
    ew = maxX - minX + pad * 2,
    eh = maxY - minY + pad * 2;
  const tmp = document.createElement("canvas");
  tmp.width = ew;
  tmp.height = eh;
  const tc = tmp.getContext("2d");
  tc.translate(-minX + pad, -minY + pad);
  confirmedPatterns.forEach((p) => drawPath(tc, p.path, 1.0, null));
  canvas.classList.add("save-flash");
  setTimeout(() => canvas.classList.remove("save-flash"), 100);
  const link = document.createElement("a");
  link.download = `hex_spell_${Date.now()}.png`;
  link.href = tmp.toDataURL("image/png");
  link.click();
}

window.addEventListener("keydown", (e) => {
  // Disable all keybinds in viewing mode
  if (typeof isViewing !== 'undefined' && isViewing) return;
  
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.shiftKey && (e.key === "S" || e.key === "s")) {
    e.preventDefault();
    exportPatternData();
    return;
  }
  if (ctrl && e.key === "s") {
    e.preventDefault();
    saveAsImage();
    return;
  }
  if (ctrl && e.key === " ") {
    e.preventDefault();
    if (acState.open) acClose();
    else acOpen();
    return;
  }
  if (ctrl && (e.key === "z" || e.key === "Z")) {
    e.preventDefault();
    undo();
    return;
  }
  if (!ctrl && e.key === "/") {
    toggleShortcutMenu();
    return;
  }
  if (e.key === "Escape") {
    const sc = document.getElementById("shortcutOverlay");
    if (sc) { sc.remove(); return; }
    if (acState.open) { acClose(); return; }
    if (placingEntry) { placingCancel(); return; }
    if (isDrawing) { isDrawing = false; currentPattern = []; draw(); }
  }
  // Rotate placing pattern: R = clockwise, E = counter-clockwise
  if (placingEntry) {
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      placingDirIdx = (placingDirIdx + 1) % 6;
      draw();
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      placingDirIdx = (placingDirIdx + 5) % 6;
      draw();
    }
  }
});

function hexToPixel(q, r) {
  return {
    x: HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r) + width / 2,
    y: HEX_SIZE * ((3 / 2) * r) + height / 2,
  };
}

function pixelToHex(x, y) {
  let q =
    ((Math.sqrt(3) / 3) * (x - width / 2) - (1 / 3) * (y - height / 2)) /
    HEX_SIZE;
  let r = ((2 / 3) * (y - height / 2)) / HEX_SIZE;
  return axialRound(q, r);
}

function axialRound(q, r) {
  let x = q,
    y = r,
    z = -q - r,
    rx = Math.round(x),
    ry = Math.round(y),
    rz = Math.round(z);
  if (
    Math.abs(rx - x) > Math.abs(ry - y) &&
    Math.abs(rx - x) > Math.abs(rz - z)
  )
    rx = -ry - rz;
  else if (Math.abs(ry - y) > Math.abs(rz - z)) ry = -rx - rz;
  return {
    q: rx,
    r: ry
  };
}

// Returns the sequence of hexes along the straight line from hex a to hex b
// Uses cube-coordinate lerp (redblobgames technique)
function hexLinePath(a, b) {
  const dist = Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(-a.q - a.r - (-b.q - b.r)),
  );
  if (dist === 0) return [];
  const results = [];
  for (let i = 1; i <= dist; i++) {
    const t = i / dist;
    // Lerp in cube coords, nudge slightly toward center to avoid ambiguity on edges
    const lq = a.q + (b.q - a.q) * t + 1e-6;
    const lr = a.r + (b.r - a.r) * t + 1e-6;
    const ls = -lq - lr;
    let rq = Math.round(lq), rr = Math.round(lr), rs = Math.round(ls);
    const dq = Math.abs(rq - lq), dr = Math.abs(rr - lr), ds = Math.abs(rs - ls);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    results.push({ q: rq, r: rr });
  }
  return results;
}

function getEdgeKey(a, b) {
  return [`${a.q},${a.r}`, `${b.q},${b.r}`].sort().join("|");
}

window.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
  // Disable drawing in viewing mode
  if (typeof isViewing !== 'undefined' && isViewing) return;

  // Placing mode: left click to place, right click to cancel
  if (placingEntry) {
    if (e.button === 0) placingPlace();
    else if (e.button === 2) placingCancel();
    return;
  }

  if (e.shiftKey && e.button === 2) {
    confirmedPatterns = [];
    usedSpotsGlobal.clear();
    usedEdgesGlobal.clear();
    draw();
    return;
  }
  if (e.button === 0) {
    const coord = pixelToHex(e.clientX, e.clientY);
    if (!usedSpotsGlobal.has(`${coord.q},${coord.r}`)) {
      isDrawing = true;
      currentPattern = [coord];
      mousePos = {
        x: e.clientX,
        y: e.clientY
      };
    }
  }
});
window.addEventListener("mousemove", (e) => {
  // Disable drawing in viewing mode
  if (typeof isViewing !== 'undefined' && isViewing) return;
  
  mousePos = {
    x: e.clientX,
    y: e.clientY
  };
  // Keep tooltip chasing cursor
  const _el = document.getElementById("patternDisplay");
  if (_el && _el.classList.contains("visible")) positionTooltip(_el);
  // Placing ghost follows mouse
  if (placingEntry) { draw(); return; }

  if (!isDrawing) {
    // Check if hovering near any confirmed pattern segment
    const HOVER_THRESHOLD = HEX_SIZE * 0.6;
    let hovered = null;
    outer: for (let pi = confirmedPatterns.length - 1; pi >= 0; pi--) {
      const path = confirmedPatterns[pi].path;
      for (let i = 0; i < path.length - 1; i++) {
        const p1 = hexToPixel(path[i].q, path[i].r);
        const p2 = hexToPixel(path[i + 1].q, path[i + 1].r);
        // Distance from point to line segment
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq ? ((e.clientX - p1.x) * dx + (e.clientY - p1.y) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const nx = p1.x + t * dx, ny = p1.y + t * dy;
        if (Math.hypot(e.clientX - nx, e.clientY - ny) < HOVER_THRESHOLD) {
          hovered = path;
          break outer;
        }
      }
    }
    const newIdx = hovered ? confirmedPatterns.findIndex(p => p.path === hovered) : -1;
    if (newIdx !== hoveredPatternIdx) {
      hoveredPatternIdx = newIdx;
      draw();
    }
    if (hovered) {
      updatePatternDisplay(hovered, "Hovering");
    } else {
      updatePatternDisplay(null);
    }
    draw();
    return;
  }
  const mh = pixelToHex(e.clientX, e.clientY);
  const last = currentPattern[currentPattern.length - 1];
  const prev = currentPattern[currentPattern.length - 2];
  const lp = hexToPixel(last.q, last.r);
  if (
    Math.hypot(e.clientX - lp.x, e.clientY - lp.y) >
    HEX_SIZE * SNAP_THRESHOLD
  ) {
    // Check if cursor moved back to previous hex (erase last step)
    if (prev && mh.q === prev.q && mh.r === prev.r) {
      currentPattern.pop();
    } else {
      // Walk every hex along the shortest path from last to mh,
      // so fast mouse movement fills in intermediate hexes correctly.
      const steps = hexLinePath(last, mh);
      for (const step of steps) {
        const cur = currentPattern[currentPattern.length - 1];
        const dist = Math.max(
          Math.abs(cur.q - step.q),
          Math.abs(cur.r - step.r),
          Math.abs(-cur.q - cur.r - (-step.q - step.r)),
        );
        if (dist !== 1) continue; // only accept adjacent steps
        const pk = `${step.q},${step.r}`;
        const ek = getEdgeKey(cur, step);
        if (usedSpotsGlobal.has(pk)) break; // stop path at collision
        let edgeInSelf = false;
        for (let i = 1; i < currentPattern.length; i++)
          if (getEdgeKey(currentPattern[i - 1], currentPattern[i]) === ek)
            { edgeInSelf = true; break; }
        if (edgeInSelf) break;
        currentPattern.push(step);
      }
    }
  }
  if (isDrawing) updatePatternDisplay(currentPattern);
  draw();
});
window.addEventListener("mouseup", (e) => {
  // Disable drawing in viewing mode
  if (typeof isViewing !== 'undefined' && isViewing) return;
  
  if (e.button === 0 && isDrawing && currentPattern.length > 1) {
    confirmedPatterns.push({
      path: [...currentPattern]
    });
    currentPattern.forEach((c, i) => {
      usedSpotsGlobal.add(`${c.q},${c.r}`);
      if (i > 0)
        usedEdgesGlobal.add(getEdgeKey(currentPattern[i - 1], c));
    });
    undoHistory.push(confirmedPatterns.length - 1); // record index of this pattern
  }
  isDrawing = false;
  currentPattern = [];
  updatePatternDisplay(null);
  draw();
});

function draw() {
  mainCtx.clearRect(0, 0, width, height);
  
  // Use viewing mode if available
  if (typeof isViewing !== 'undefined' && isViewing && typeof drawViewingMode === 'function') {
    drawViewingMode(mainCtx, width, height);
    return;
  }
  
  // Normal drawing mode
  const range = 25;
  for (let q = -range; q <= range; q++)
    for (let r = -range; r <= range; r++) {
      if (Math.abs(q + r) <= range) {
        const pos = hexToPixel(q, r),
          d = Math.hypot(pos.x - mousePos.x, pos.y - mousePos.y);
        const occ = usedSpotsGlobal.has(`${q},${r}`);
        const sz = occ ? 2 : Math.max(0.3, 3 * (1 - d / 180));
        mainCtx.fillStyle = occ ? "#4a4a4a" : "#00FFFF";
        mainCtx.globalAlpha = 1;
        mainCtx.beginPath();
        mainCtx.arc(pos.x, pos.y, sz, 0, Math.PI * 2);
        mainCtx.fill();
      }
    }
  mainCtx.globalAlpha = 1.0;

  // Snap indicator: highlight hex under cursor
  if (!placingEntry) {
    const snap = pixelToHex(mousePos.x, mousePos.y);
    const sp = hexToPixel(snap.q, snap.r);
    const isFree = !usedSpotsGlobal.has(`${snap.q},${snap.r}`);
    if (isFree) {
      mainCtx.save();
      mainCtx.globalAlpha = 0.18;
      mainCtx.fillStyle = isDrawing ? "#a855f7" : "#00FFFF";
      mainCtx.beginPath();
      // Draw hex shape
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i - 30);
        const hx = sp.x + HEX_SIZE * 0.85 * Math.cos(angle);
        const hy = sp.y + HEX_SIZE * 0.85 * Math.sin(angle);
        i === 0 ? mainCtx.moveTo(hx, hy) : mainCtx.lineTo(hx, hy);
      }
      mainCtx.closePath();
      mainCtx.fill();
      mainCtx.restore();
    }
  }

  // Draw confirmed patterns; highlight hovered one
  confirmedPatterns.forEach((p, i) => {
    if (i === hoveredPatternIdx) {
      // Draw glow behind it
      mainCtx.save();
      mainCtx.lineWidth = 9;
      mainCtx.lineCap = "round";
      mainCtx.lineJoin = "round";
      mainCtx.strokeStyle = "#a855f7";
      mainCtx.globalAlpha = 0.22;
      for (let j = 0; j < p.path.length - 1; j++) {
        const p1 = hexToPixel(p.path[j].q, p.path[j].r);
        const p2 = hexToPixel(p.path[j+1].q, p.path[j+1].r);
        mainCtx.beginPath();
        mainCtx.moveTo(p1.x, p1.y);
        mainCtx.lineTo(p2.x, p2.y);
        mainCtx.stroke();
      }
      mainCtx.restore();
    }
    drawPath(mainCtx, p.path, 1.0, null);
  });

  if (isDrawing) drawPath(mainCtx, currentPattern, 1.0, mousePos);
  if (placingEntry) drawPlacingGhost(mainCtx);

}

function drawPath(tc, path, opacity, rubber) {
  if (!path.length) return;
  tc.lineWidth = 3;
  tc.lineCap = "round";
  tc.lineJoin = "round";
  tc.globalAlpha = opacity;

  const COLORS = ["#ff6bff", "#a81ee3", "#6490ed", "#b189c7"];
  const lineCount = path.length - 1;

  const usedPoints = [];
  let colorIndex = 0;

  function drawArrow(x, y, travelAngle, color, R) {
    tc.fillStyle = color;
    tc.beginPath();
    tc.moveTo(
      x + Math.cos(travelAngle) * R,
      y + Math.sin(travelAngle) * R,
    );
    tc.lineTo(
      x + Math.cos(travelAngle + 2.0944) * R,
      y + Math.sin(travelAngle + 2.0944) * R,
    );
    tc.lineTo(
      x + Math.cos(travelAngle - 2.0944) * R,
      y + Math.sin(travelAngle - 2.0944) * R,
    );
    tc.closePath();
    tc.fill();
  }

  if (rubber) {
    const lp = hexToPixel(
      path[path.length - 1].q,
      path[path.length - 1].r,
    );
    tc.strokeStyle = COLORS[colorIndex];
    tc.lineWidth = 2;
    tc.beginPath();
    tc.moveTo(lp.x, lp.y);
    tc.lineTo(rubber.x, rubber.y);
    tc.stroke();
    tc.lineWidth = 3;
  }

  if (path.length >= 2) {
    const p0 = hexToPixel(path[0].q, path[0].r);
    const p1 = hexToPixel(path[1].q, path[1].r);
    const ax = p0.x + (p1.x - p0.x) / 2.15;
    const ay = p0.y + (p1.y - p0.y) / 2.15;
    drawArrow(ax, ay, Math.atan2(p1.y - p0.y, p1.x - p0.x), COLORS[0], 9);
  }

  for (let i = 0; i < lineCount + 1; i++) {
    const coord = path[i];
    let repeats = false;

    for (let j = 0; j < usedPoints.length; j++) {
      const u = usedPoints[j];
      const sameColor =
        colorIndex === u.ci ||
        (3 - (colorIndex % 3) === u.ci && colorIndex > 3);
      if (u.q === coord.q && u.r === coord.r && sameColor) {
        repeats = true;
        usedPoints[j].ci += 1;
        break;
      }
    }

    if (repeats) {
      colorIndex = (colorIndex + 1) % COLORS.length;
      const pPrev = hexToPixel(path[i - 1].q, path[i - 1].r);
      const pCurr = hexToPixel(path[i].q, path[i].r);
      const bx = (pPrev.x + pCurr.x) / 2;
      const by = (pPrev.y + pCurr.y) / 2;

      tc.strokeStyle = COLORS[colorIndex];
      tc.beginPath();
      tc.moveTo(pCurr.x, pCurr.y);
      tc.lineTo(bx, by);
      tc.stroke();

      const travelAngle = Math.atan2(
        pCurr.y - pPrev.y,
        pCurr.x - pPrev.x,
      );
      drawArrow(bx, by, travelAngle, COLORS[colorIndex], 7);
    } else {
      usedPoints.push({
        q: coord.q,
        r: coord.r,
        ci: colorIndex
      });
    }

    if (i !== lineCount) {
      const p1 = hexToPixel(path[i].q, path[i].r);
      const p2 = hexToPixel(path[i + 1].q, path[i + 1].r);
      tc.strokeStyle = COLORS[colorIndex];
      tc.beginPath();
      tc.moveTo(p1.x, p1.y);
      tc.lineTo(p2.x, p2.y);
      tc.stroke();
      tc.fillStyle = "#ffffff";
      tc.beginPath();
      tc.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
      tc.fill();
    }
  }

  {
    const pL = hexToPixel(
      path[path.length - 1].q,
      path[path.length - 1].r,
    );
    tc.fillStyle = "#ffffff";
    tc.beginPath();
    tc.arc(pL.x, pL.y, 6, 0, Math.PI * 2);
    tc.fill();
    tc.fillStyle = COLORS[colorIndex];
    tc.beginPath();
    tc.arc(pL.x, pL.y, 3, 0, Math.PI * 2);
    tc.fill();
  }

  {
    const pF = hexToPixel(path[0].q, path[0].r);
    tc.fillStyle = "#ffffff";
    tc.beginPath();
    tc.arc(pF.x, pF.y, 6, 0, Math.PI * 2);
    tc.fill();
    tc.fillStyle = COLORS[0];
    tc.beginPath();
    tc.arc(pF.x, pF.y, 3, 0, Math.PI * 2);
    tc.fill();
  }

  tc.globalAlpha = 1.0;
}


// ─── Undo ─────────────────────────────────────────────────────────────────────

function undo() {
  if (confirmedPatterns.length === 0) { showToast("Nothing to undo."); return; }

  // Remove the last confirmed pattern and rebuild usedSpotsGlobal/usedEdgesGlobal
  confirmedPatterns.pop();
  undoHistory.pop();

  // Rebuild used sets from scratch
  usedSpotsGlobal.clear();
  usedEdgesGlobal.clear();
  confirmedPatterns.forEach(p => {
    p.path.forEach((c, i) => {
      usedSpotsGlobal.add(`${c.q},${c.r}`);
      if (i > 0) usedEdgesGlobal.add(getEdgeKey(p.path[i-1], c));
    });
  });

  hoveredPatternIdx = -1;
  draw();
  showToast("Undone.");
}

// ─── Shortcut Cheatsheet ──────────────────────────────────────────────────────

function toggleShortcutMenu() {
  const existing = document.getElementById("shortcutOverlay");
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement("div");
  overlay.id = "shortcutOverlay";

  const shortcuts = [
    ["Draw", "Click & drag"],
    ["Undo", "Ctrl/Cmd + Z"],
    ["Autocomplete", "Ctrl/Cmd + Space"],
    ["Clear all", "Shift + Right-click"],
    ["Cancel drawing", "Escape"],
    ["Save image", "Ctrl/Cmd + S"],
    ["Export data", "Ctrl/Cmd + Shift + S"],
    ["Shortcuts", "/"],
    ["— Placing mode —", ""],
    ["Rotate CW", "R"],
    ["Rotate CCW", "E"],
    ["Place", "Left click"],
    ["Cancel placing", "Escape / Right-click"],
  ];

  overlay.innerHTML = `
    <div id="shortcutPanel">
      <div class="sc-title">Keyboard Shortcuts</div>
      <table class="sc-table">
        ${shortcuts.map(([action, key]) => key
          ? `<tr><td class="sc-action">${action}</td><td class="sc-key"><kbd>${key}</kbd></td></tr>`
          : `<tr><td class="sc-section" colspan="2">${action}</td></tr>`
        ).join("")}
      </table>
      <div class="sc-hint">Press ? or click outside to close</div>
    </div>
  `;

  overlay.addEventListener("mousedown", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ─── Autocomplete ────────────────────────────────────────────────────────────

let acState = {
  open: false,
  query: "",
  results: [],
  chosen: 0,
};

function acBuildResults(query) {
  const q = query.toLowerCase().trim();
  const entries = [];

  // If query is a number, prepend a special number entry
  const numVal = parseFloat(query);
  if (query !== "" && !isNaN(numVal) && isFinite(numVal)) {
    const patterns = numberToPatternEntries(numVal);
    if (patterns && patterns.length > 0) {
      // Represent as a single selectable entry; _numberPatterns holds multi-pattern list
      entries.push({
        sig: patterns[0].sig,
        name: "Numerical Reflection (" + numVal + ")",
        _numberPatterns: patterns,
      });
    }
  }

  for (const [sig, name] of Object.entries(PATTERN_NAMES)) {
    if (!q || name.toLowerCase().includes(q) || sig.includes(q)) {
      entries.push({ sig, name });
    }
  }
  // Sort non-number entries
  const numEntries = entries.filter(e => e._numberPatterns);
  const rest = entries.filter(e => !e._numberPatterns);
  rest.sort((a, b) => {
    const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
    const aStart = an.startsWith(q) ? 0 : 1;
    const bStart = bn.startsWith(q) ? 0 : 1;
    if (aStart !== bStart) return aStart - bStart;
    return an.localeCompare(bn);
  });
  return [...numEntries, ...rest];
}

function acOpen() {
  acState.open = true;
  acState.query = "";
  acState.results = acBuildResults("");
  acState.chosen = 0;
  acRender();
  const input = document.getElementById("acInput");
  if (input) input.focus();
}

function acClose() {
  acState.open = false;
  const overlay = document.getElementById("acOverlay");
  if (overlay) overlay.remove();
}

// ─── Placing State ───────────────────────────────────────────────────────────

function acCommit(entry) {
  if (!entry) return;
  acClose();

  // Multi-pattern number (e.g. fraction or large decomposition): queue them all
  if (entry._numberPatterns && entry._numberPatterns.length > 1) {
    placingQueue = entry._numberPatterns.slice();
    acStartNextFromQueue();
    return;
  }

  placingEntry = entry._numberPatterns ? entry._numberPatterns[0] : entry;
  placingDirIdx = 1;
  document.body.classList.add("placing-mode");
  draw();
}

// Queue for multi-pattern placements (e.g. decomposed numbers)
let placingQueue = [];

function acStartNextFromQueue() {
  if (placingQueue.length === 0) return;
  const next = placingQueue.shift();
  placingEntry = next;
  placingDirIdx = 1;
  document.body.classList.add("placing-mode");
  draw();
}

function placingGetPath() {
  if (!placingEntry) return null;
  const dir = PLACE_DIRS[placingDirIdx];
  const raw = angleSignatureToPath(placingEntry.sig, dir);
  // Offset so the start point (path[0]) sits at (0,0)
  const oQ = raw[0].q;
  const oR = raw[0].r;
  return raw.map(c => ({ q: c.q - oQ, r: c.r - oR }));
}

function placingOffsetPath(basePath, anchorQ, anchorR) {
  return basePath.map(c => ({ q: c.q + anchorQ, r: c.r + anchorR }));
}

function placingHasIntersect(path) {
  // Check spots
  for (const c of path) {
    if (usedSpotsGlobal.has(`${c.q},${c.r}`)) return true;
  }
  // Check edges
  for (let i = 1; i < path.length; i++) {
    if (usedEdgesGlobal.has(getEdgeKey(path[i-1], path[i]))) return true;
  }
  return false;
}

function hexRing(radius) {
  if (radius === 0) return [{ dq: 0, dr: 0 }];
  const ring = [];
  let rq = radius, rr = 0; // start east by radius
  for (let side = 0; side < 6; side++) {
    const moveDir = (side + 2) % 6;
    for (let step = 0; step < radius; step++) {
      ring.push({ dq: rq, dr: rr });
      rq += DIR_DELTAS[moveDir].dq;
      rr += DIR_DELTAS[moveDir].dr;
    }
  }
  return ring;
}

function placingNudge(basePath, anchorQ, anchorR) {
  // Try increasingly large rings of offsets to find a free position
  for (let radius = 1; radius <= 12; radius++) {
    for (const { dq, dr } of hexRing(radius)) {
      const candidate = placingOffsetPath(basePath, anchorQ + dq, anchorR + dr);
      const allOnScreen = candidate.every(c => {
        const px = hexToPixel(c.q, c.r);
        return px.x > 20 && px.x < width - 20 && px.y > 20 && px.y < height - 20;
      });
      if (allOnScreen && !placingHasIntersect(candidate)) {
        return candidate;
      }
    }
  }
  return null; // nowhere to place
}

function placingPlace() {
  const base = placingGetPath();
  if (!base) return;
  const anchor = pixelToHex(mousePos.x, mousePos.y);
  const path = placingOffsetPath(base, anchor.q, anchor.r);

  let finalPath = path;
  if (placingIsOffScreen(path) || placingHasIntersect(path)) {
    finalPath = placingNudge(base, anchor.q, anchor.r);
    if (!finalPath) {
      showToast("No room to place pattern here!");
      return;
    }
  }

  confirmedPatterns.push({ path: finalPath });
  finalPath.forEach((c, i) => {
    usedSpotsGlobal.add(`${c.q},${c.r}`);
    if (i > 0) usedEdgesGlobal.add(getEdgeKey(finalPath[i-1], finalPath[i]));
  });
  undoHistory.push(confirmedPatterns.length - 1);

  const placedName = placingEntry.name;
  placingEntry = null;
  if (placingQueue.length > 0) {
    acStartNextFromQueue();
  } else {
    document.body.classList.remove("placing-mode");
  }
  draw();
  showToast(placingQueue.length > 0 ? `Placed: ${placedName} — place next pattern` : `Placed: ${placedName}`);
}

function placingCancel() {
  placingEntry = null;
  placingQueue = [];
  document.body.classList.remove("placing-mode");
  draw();
}

function placingIsOffScreen(path) {
  return path.some(c => {
    const px = hexToPixel(c.q, c.r);
    return px.x < 0 || px.x > width || px.y < 0 || px.y > height;
  });
}

function drawGhostPath(ctx, path, lineColor, dotColor, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = hexToPixel(path[i].q, path[i].r);
    const p2 = hexToPixel(path[i+1].q, path[i+1].r);
    ctx.strokeStyle = lineColor;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (let i = 0; i < path.length; i++) {
    const p = hexToPixel(path[i].q, path[i].r);
    const isEnd = i === path.length - 1;
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isEnd ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
    if (isEnd) {
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawPlacingGhost(ctx) {
  if (!placingEntry) return;
  const base = placingGetPath();
  if (!base) return;
  const anchor = pixelToHex(mousePos.x, mousePos.y);
  const path = placingOffsetPath(base, anchor.q, anchor.r);
  const offScreen = placingIsOffScreen(path);
  const blocked = offScreen || placingHasIntersect(path);

  // Draw nudge suggestion underneath (gray) if cursor pos is invalid
  if (blocked) {
    const nudged = placingNudge(base, anchor.q, anchor.r);
    if (nudged) {
      drawGhostPath(ctx, nudged, "#555566", "#444455", 0.45);
    }
  }

  // Draw cursor ghost on top — blue normally, red-tinted if blocked
  const lineColor = blocked ? "#6644aa" : "#4488ff";
  const dotColor  = blocked ? "#7755bb" : "#aaccff";
  drawGhostPath(ctx, path, lineColor, dotColor, 0.75);

  // Direction label near cursor
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = blocked ? "#7755bb" : "#88bbff";
  ctx.font = "11px monospace";
  ctx.fillText(PLACE_DIRS[placingDirIdx], mousePos.x + 14, mousePos.y - 10);
  ctx.restore();
}

function acRender() {
  let overlay = document.getElementById("acOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "acOverlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", e => {
      if (e.target === overlay) acClose();
    });
  }

  const MAX_VISIBLE = 8;
  const chosen = acState.chosen;
  const results = acState.results;
  const total = results.length;

  // Sliding window: keep chosen visible
  let winStart = Math.max(0, Math.min(chosen - 2, total - MAX_VISIBLE));
  let winEnd = Math.min(total, winStart + MAX_VISIBLE);

  const itemsHtml = results.slice(winStart, winEnd).map((entry, i) => {
    const idx = winStart + i;
    const active = idx === chosen ? "ac-item-active" : "";
    return `<div class="ac-item ${active}" data-idx="${idx}">
      <span class="ac-item-name">${entry.name}</span>
      <span class="ac-item-sig">${entry.sig || "—"}</span>
    </div>`;
  }).join("");

  const countHtml = total > 0
    ? `<div class="ac-count">${chosen + 1} / ${total}</div>`
    : `<div class="ac-count ac-count-empty">No matches</div>`;

  overlay.innerHTML = `
    <div id="acPanel">
      <div id="acInputRow">
        <span class="ac-icon">⬡</span>
        <input id="acInput" type="text" placeholder="Search patterns…" autocomplete="off" spellcheck="false" value="${acState.query}" />
      </div>
      <div id="acBody">
        <div id="acListCol">
          <div id="acList">${itemsHtml || '<div class="ac-empty">No patterns found</div>'}</div>
          ${countHtml}
          <div class="ac-hint">↑↓ navigate &nbsp;·&nbsp; Enter commit &nbsp;·&nbsp; Esc cancel</div>
        </div>
        <div id="acPreviewCol">
          <canvas id="acPreviewCanvas" width="160" height="160"></canvas>
          <div id="acPreviewName"></div>
        </div>
      </div>
    </div>
  `;

  // Re-bind input
  const input = document.getElementById("acInput");
  input.focus();
  // Move cursor to end
  const len = input.value.length;
  input.setSelectionRange(len, len);

  input.addEventListener("input", e => {
    acState.query = e.target.value;
    acState.results = acBuildResults(acState.query);
    acState.chosen = 0;
    acRender();
  });

  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown")    { e.preventDefault(); acOffsetChosen(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); acOffsetChosen(-1); }
    else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      acCommit(acState.results[acState.chosen]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      acClose();
    }
  });

  // Click on items
  overlay.querySelectorAll(".ac-item").forEach(el => {
    el.addEventListener("mousedown", e => {
      e.preventDefault();
      const idx = parseInt(el.dataset.idx);
      acCommit(acState.results[idx]);
    });

  });

  // Render preview for currently chosen entry
  acRenderPreview();

  // Scroll wheel on list
  const list = document.getElementById("acList");
  list.addEventListener("wheel", e => {
    e.preventDefault();
    acOffsetChosen(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
}

function acRenderPreview() {
  const canvas = document.getElementById("acPreviewCanvas");
  const nameEl = document.getElementById("acPreviewName");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const entry = acState.results[acState.chosen];
  if (!entry || !entry.sig || entry._numberPatterns) {
    if (nameEl) nameEl.textContent = entry ? entry.name : "";
    return;
  }

  // Build path
  const raw = angleSignatureToPath(entry.sig, "northeast");
  if (!raw || raw.length < 2) return;

  // Fit to canvas
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const PREVIEW_HEX = 18;
  const pts = raw.map(c => ({
    x: PREVIEW_HEX * (Math.sqrt(3) * c.q + Math.sqrt(3)/2 * c.r),
    y: PREVIEW_HEX * (3/2 * c.r)
  }));
  pts.forEach(p => { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
  const pw = maxX-minX || 1, ph = maxY-minY || 1;
  const scale = Math.min((W-24)/pw, (H-24)/ph, 1);
  const ox = (W - pw*scale)/2 - minX*scale;
  const oy = (H - ph*scale)/2 - minY*scale;
  const tp = pts.map(p => ({ x: p.x*scale+ox, y: p.y*scale+oy }));

  const COLORS = ["#ff6bff","#a81ee3","#6490ed","#b189c7"];
  ctx.lineWidth = 2.5; ctx.lineCap="round"; ctx.lineJoin="round";

  // Draw lines with same color logic as main drawPath
  const usedPts = []; let ci = 0;
  for (let i = 0; i < tp.length; i++) {
    const coord = raw[i];
    let repeats = false;
    for (let j = 0; j < usedPts.length; j++) {
      const u = usedPts[j];
      if (u.q===coord.q && u.r===coord.r && (ci===u.ci||(3-(ci%3)===u.ci&&ci>3))) {
        repeats=true; usedPts[j].ci+=1; break;
      }
    }
    if (repeats) ci = (ci+1)%COLORS.length;
    else usedPts.push({q:coord.q,r:coord.r,ci});
    if (i < tp.length-1) {
      ctx.strokeStyle = COLORS[ci];
      ctx.beginPath(); ctx.moveTo(tp[i].x,tp[i].y); ctx.lineTo(tp[i+1].x,tp[i+1].y); ctx.stroke();
      ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(tp[i].x,tp[i].y,2.5,0,Math.PI*2); ctx.fill();
    }
  }
  // End dot
  const last = tp[tp.length-1];
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(last.x,last.y,4,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=COLORS[ci]; ctx.beginPath(); ctx.arc(last.x,last.y,2,0,Math.PI*2); ctx.fill();
  // Start dot
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(tp[0].x,tp[0].y,4,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=COLORS[0]; ctx.beginPath(); ctx.arc(tp[0].x,tp[0].y,2,0,Math.PI*2); ctx.fill();

  if (nameEl) nameEl.textContent = entry.name;
}

function acOffsetChosen(by) {
  const size = acState.results.length;
  if (size === 0) return;
  acState.chosen = ((acState.chosen + by) % size + size) % size;
  acRender();
}

