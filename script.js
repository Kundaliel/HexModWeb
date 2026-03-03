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
  if (e.key === "Escape" && isDrawing) {
    isDrawing = false;
    currentPattern = [];
    draw();
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

function getEdgeKey(a, b) {
  return [`${a.q},${a.r}`, `${b.q},${b.r}`].sort().join("|");
}

window.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
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
  mousePos = {
    x: e.clientX,
    y: e.clientY
  };
  if (!isDrawing) {
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
    if (prev && mh.q === prev.q && mh.r === prev.r) {
      currentPattern.pop();
    } else if (
      Math.max(
        Math.abs(last.q - mh.q),
        Math.abs(last.r - mh.r),
        Math.abs(-last.q - last.r - (-mh.q - mh.r)),
      ) === 1
    ) {
      const pk = `${mh.q},${mh.r}`,
        ek = getEdgeKey(last, mh);
      if (!usedSpotsGlobal.has(pk)) {
        let edgeInSelf = false;
        for (let i = 1; i < currentPattern.length; i++)
          if (getEdgeKey(currentPattern[i - 1], currentPattern[i]) === ek)
            edgeInSelf = true;
        if (!edgeInSelf) currentPattern.push(mh);
      }
    }
  }
  draw();
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 0 && isDrawing && currentPattern.length > 1) {
    confirmedPatterns.push({
      path: [...currentPattern]
    });
    currentPattern.forEach((c, i) => {
      usedSpotsGlobal.add(`${c.q},${c.r}`);
      if (i > 0)
        usedEdgesGlobal.add(getEdgeKey(currentPattern[i - 1], c));
    });
  }
  isDrawing = false;
  currentPattern = [];
  draw();
});

function draw() {
  mainCtx.clearRect(0, 0, width, height);
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
  confirmedPatterns.forEach((p) => drawPath(mainCtx, p.path, 1.0, null));
  if (isDrawing) drawPath(mainCtx, currentPattern, 1.0, mousePos);
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
    drawArrow(ax, ay, Math.atan2(p1.y - p0.y, p1.x - p0.x), COLORS[0], 5);
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
      drawArrow(bx, by, travelAngle, COLORS[colorIndex], 5);
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