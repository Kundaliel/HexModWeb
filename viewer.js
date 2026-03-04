// Viewer-specific variables
let isViewing = false;
let viewingPattern = null;

// Parse URL hash to check for viewing mode
function parseUrlHash() {
  const hash = window.location.hash.substring(1); // Remove the '#'
  if (!hash) return null;
  
  const parts = hash.split('-');
  let direction = 'north';
  let pattern = '';
  
  if (parts.length === 1) {
    // Format: #qaq
    pattern = parts[0];
  } else if (parts.length === 2) {
    // Format: #west-qaq
    direction = parts[0].toLowerCase();
    pattern = parts[1];
  }
  
  // Validate direction
  const validDirections = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'];
  if (!validDirections.includes(direction)) {
    direction = 'north';
  }
  
  return { direction, pattern };
}

// Convert angle signature and direction to hex path
function angleSignatureToPath(angleSig, startDir) {
  const dirMap = {
    'east': 0,
    'northeast': 1,
    'northwest': 2,
    'west': 3,
    'southwest': 4,
    'southeast': 5,
    'north': 1,
    'south': 4
  };
  
  let currentDir = dirMap[startDir.toLowerCase()] ?? 1; // Default to northeast (north)
  
  const path = [{ q: 0, r: 0 }];
  
  // Add first step in the starting direction
  const firstDelta = DIR_DELTAS[currentDir];
  path.push({ 
    q: path[0].q + firstDelta.dq, 
    r: path[0].r + firstDelta.dr 
  });
  
  // Process each character in the angle signature
  for (const char of angleSig) {
    let turn = 0;
    switch (char) {
      case 'w': turn = 0; break;  // straight
      case 'q': turn = 1; break;  // slight right
      case 'a': turn = 2; break;  // sharp right
      case 'd': turn = 4; break;  // sharp left
      case 'e': turn = 5; break;  // slight left
      default: continue;
    }
    
    currentDir = (currentDir + turn) % 6;
    const delta = DIR_DELTAS[currentDir];
    const lastPos = path[path.length - 1];
    path.push({
      q: lastPos.q + delta.dq,
      r: lastPos.r + delta.dr
    });
  }
  
  return path;
}

// Create info bar for viewing mode
function createInfoBar(patternName, direction, patternCode) {
  const infoBar = document.createElement("div");
  infoBar.id = "infoBar";
  infoBar.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #1e1b2e;
    color: #d783ff;
    border: 2px solid #4a2070;
    border-radius: 8px;
    padding: 15px 20px;
    font-family: monospace;
    font-size: 14px;
    z-index: 1000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  `;
  
  infoBar.innerHTML = `
    <div style="display: flex; gap: 20px; align-items: center;">
      <div>
        <div style="color: #8b5cf6; font-weight: bold; margin-bottom: 5px;">Pattern Name</div>
        <div>${patternName}</div>
      </div>
      <div style="width: 1px; height: 40px; background: #4a2070;"></div>
      <div>
        <div style="color: #8b5cf6; font-weight: bold; margin-bottom: 5px;">Direction</div>
        <div>${direction}</div>
      </div>
      <div style="width: 1px; height: 40px; background: #4a2070;"></div>
      <div>
        <div style="color: #8b5cf6; font-weight: bold; margin-bottom: 5px;">Pattern Code</div>
        <div>${patternCode}</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(infoBar);
}

// Initialize viewing mode if URL hash is present
function initViewingMode() {
  const urlData = parseUrlHash();
  if (urlData && urlData.pattern) {
    isViewing = true;
    const path = angleSignatureToPath(urlData.pattern, urlData.direction);
    
    const patternName = PATTERN_NAMES[urlData.pattern] || parseNumber(urlData.pattern) || "Unknown Pattern";
    
    viewingPattern = {
      path: path,
      direction: urlData.direction,
      pattern: urlData.pattern,
      name: patternName
    };
    
    confirmedPatterns = [{ path: path }];
    createInfoBar(patternName, urlData.direction, urlData.pattern);
    
    // Redraw to show the pattern immediately
    if (typeof draw === 'function') {
      draw();
    }
  }
}

// Draw pattern enlarged and centered for viewing mode
function drawViewingMode(ctx, width, height) {
  if (!viewingPattern) return;
  
  const ENLARGED_HEX_SIZE = 50; // Larger hex size for viewing
  
  // Calculate bounding box of the pattern
  let minQ = Infinity, maxQ = -Infinity;
  let minR = Infinity, maxR = -Infinity;
  
  viewingPattern.path.forEach(coord => {
    minQ = Math.min(minQ, coord.q);
    maxQ = Math.max(maxQ, coord.q);
    minR = Math.min(minR, coord.r);
    maxR = Math.max(maxR, coord.r);
  });
  
  // Calculate center offset
  const centerQ = (minQ + maxQ) / 2;
  const centerR = (minR + maxR) / 2;
  
  ctx.save();
  ctx.translate(width / 2, height / 2);
  const scale = ENLARGED_HEX_SIZE / HEX_SIZE;
  ctx.scale(scale, scale);
  
  // Draw the pattern path with custom sizing
  drawPathEnlarged(ctx, viewingPattern.path, centerQ, centerR);
  
  ctx.restore();
}

// Draw path function for viewing mode (centered)
function drawPathEnlarged(ctx, path, centerQ, centerR) {
  if (!path.length) return;
  
  function hexToPixelCentered(q, r) {
    const adjQ = q - centerQ;
    const adjR = r - centerR;
    return {
      x: HEX_SIZE * (Math.sqrt(3) * adjQ + (Math.sqrt(3) / 2) * adjR),
      y: HEX_SIZE * ((3 / 2) * adjR)
    };
  }
  
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1;

  const COLORS = ["#ff6bff", "#a81ee3", "#6490ed", "#b189c7"];
  const lineCount = path.length - 1;

  const usedPoints = [];
  let colorIndex = 0;

  function drawArrow(x, y, travelAngle, color, R) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(
      x + Math.cos(travelAngle) * R,
      y + Math.sin(travelAngle) * R,
    );
    ctx.lineTo(
      x + Math.cos(travelAngle + 2.0944) * R,
      y + Math.sin(travelAngle + 2.0944) * R,
    );
    ctx.lineTo(
      x + Math.cos(travelAngle - 2.0944) * R,
      y + Math.sin(travelAngle - 2.0944) * R,
    );
    ctx.closePath();
    ctx.fill();
  }

  if (path.length >= 2) {
    const p0 = hexToPixelCentered(path[0].q, path[0].r);
    const p1 = hexToPixelCentered(path[1].q, path[1].r);
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
      const pPrev = hexToPixelCentered(path[i - 1].q, path[i - 1].r);
      const pCurr = hexToPixelCentered(path[i].q, path[i].r);
      const bx = (pPrev.x + pCurr.x) / 2;
      const by = (pPrev.y + pCurr.y) / 2;

      ctx.strokeStyle = COLORS[colorIndex];
      ctx.beginPath();
      ctx.moveTo(pCurr.x, pCurr.y);
      ctx.lineTo(bx, by);
      ctx.stroke();

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
      const p1 = hexToPixelCentered(path[i].q, path[i].r);
      const p2 = hexToPixelCentered(path[i + 1].q, path[i + 1].r);
      ctx.strokeStyle = COLORS[colorIndex];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  {
    const pL = hexToPixelCentered(
      path[path.length - 1].q,
      path[path.length - 1].r,
    );
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(pL.x, pL.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS[colorIndex];
    ctx.beginPath();
    ctx.arc(pL.x, pL.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  {
    const pF = hexToPixelCentered(path[0].q, path[0].r);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(pF.x, pF.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS[0];
    ctx.beginPath();
    ctx.arc(pF.x, pF.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1.0;
}

// Initialize viewing mode when this script loads
initViewingMode();
