(function () {
  'use strict';

  var SYMBOLS = [
    '±','×','÷','·','=','≠','≈','≤','≥','<','>','(',')','[',']','{','}',
    '√','∛','∑','∏','∫','∂','∞','π','θ','α','β','γ','Δ','λ','μ','σ','φ','ω',
    '→','⇒','↔','∴','∵','∈','∉','⊂','∪','∩','∀','∃',
    '°','′','″','∠','⊥','∥','△','□','|x|','!','%','‰'
  ];
  var TEMPLATES = [
    { label: 'a/b', value: '( )/( )' }, { label: 'xⁿ', value: '^( )' }, { label: 'xₙ', value: '_( )' },
    { label: '√x', value: '√( )' }, { label: 'ⁿ√x', value: 'n√( )' }, { label: '∑', value: '∑_(i=1)^(n) ' },
    { label: '∫', value: '∫_( )^( )  d' }, { label: 'lim', value: 'lim_(x→ ) ' }, { label: 'd/dx', value: 'd/dx ' },
    { label: 'log', value: 'log_( )( )' }, { label: 'sin', value: 'sin( )' }, { label: 'cos', value: 'cos( )' },
    { label: 'tan', value: 'tan( )' }, { label: 'vec', value: 'vec( )' },
    { label: '행렬2', value: '[ [a, b], [c, d] ]' }, { label: '경우', value: '{  , x ≥ 0\n{  , x < 0' },
    { label: 'f(x)', value: 'f(x)= ' }, { label: 'y=', value: 'y = ' }
  ];

  var canvas = document.getElementById('canvas');
  var stage = document.getElementById('stage');
  var overlay = document.getElementById('overlay');
  var ctx = canvas.getContext('2d');
  var statusTool = document.getElementById('status-tool');
  var statusPos = document.getElementById('status-pos');
  var statusZoom = document.getElementById('status-zoom');
  var zoomReadout = document.getElementById('zoom-reset');
  var mathPanel = document.getElementById('math-panel');
  var mathToggle = document.getElementById('math-toggle');
  var mathInput = document.getElementById('math-input');
  var calcInput = document.getElementById('calc-input');
  var calcResult = document.getElementById('calc-result');
  var fileInput = document.getElementById('file-input');

  var state = {
    tool: 'pen', ink: '#1f2328', size: 2, polySides: 6,
    drawing: false, placing: false, panning: false, spacePan: false, panStart: null,
    strokes: [], items: [], current: null, polygon: null,
    selection: null, draggingHandle: null, dragSnapshot: null, draggingItem: null,
    lasso: null, lassoMove: null,
    undo: [], redo: [],
    view: { x: 0, y: 0, zoom: 1 }, grid: false, curve: false
  };

  var TOOL_NAMES = { pen: '펜', eraser: '지우개', text: '텍스트', pan: '이동', line: '직선', rect: '사각형', ellipse: '원/타원', polygon: '다각형', regpoly: '정다각형', select: '선택/편집', lasso: '올가미' };
  var MIN_ZOOM = 0.25, MAX_ZOOM = 4;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function pushUndo() {
    state.undo.push(JSON.stringify({ strokes: state.strokes, items: state.items, view: state.view }));
    if (state.undo.length > 120) state.undo.shift();
    state.redo = [];
  }
  function restore(snapshot) {
    var data = JSON.parse(snapshot);
    state.strokes = data.strokes || [];
    state.items = data.items || [];
    if (data.view && typeof data.view.zoom === 'number') state.view = data.view;
    renderOverlay(); redraw();
  }
  function updateZoomUI() {
    var pct = Math.round(state.view.zoom * 100) + '%';
    statusZoom.textContent = pct; zoomReadout.textContent = pct;
  }
  function cancelPolygon() { state.polygon = null; }

  function setTool(tool) {
    if (state.tool === 'polygon' && tool !== 'polygon') cancelPolygon();
    if (tool !== 'select') { state.selection = null; state.draggingHandle = null; }
    if (tool !== 'lasso') { state.lasso = null; state.lassoMove = null; }
    state.tool = tool; state.placing = false;
    statusTool.textContent = TOOL_NAMES[tool] || tool;
    document.querySelectorAll('.tool[data-tool]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tool') === tool);
    });
    canvas.style.cursor = tool === 'text' ? 'text' : tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : tool === 'lasso' ? 'crosshair' : 'crosshair';
    redraw();
  }

  function resize() {
    var r = stage.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(r.width * dpr));
    canvas.height = Math.max(1, Math.floor(r.height * dpr));
    canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
    ctx = canvas.getContext('2d');
    redraw();
  }
  function setTransform() {
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr * state.view.zoom, 0, 0, dpr * state.view.zoom, dpr * state.view.x, dpr * state.view.y);
  }
  function worldPoint(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left - state.view.x) / state.view.zoom, y: (clientY - r.top - state.view.y) / state.view.zoom };
  }

  function drawGrid(w, h) {
    if (!state.grid) return;
    var step = 32, z = state.view.zoom;
    var left = -state.view.x / z, top = -state.view.y / z;
    var right = left + w / z, bottom = top + h / z;
    var startX = Math.floor(left / step) * step, startY = Math.floor(top / step) * step;
    ctx.save(); ctx.strokeStyle = '#eceef0'; ctx.lineWidth = 1 / z; ctx.beginPath();
    for (var x = startX; x <= right; x += step) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
    for (var y = startY; y <= bottom; y += step) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
    ctx.stroke(); ctx.restore();
  }

  function redraw() {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    setTransform();
    drawGrid(w, h);
    state.strokes.forEach(drawStroke);
    if (state.current) drawStroke(state.current);
    if (state.polygon) drawPolygonPreview(state.polygon);
    drawLasso();
    drawSelection();
    renderOverlay(); updateZoomUI();
  }

  function applyStrokeStyle(s) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = s.ink; ctx.lineWidth = s.size;
    if (s.erase) { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = 'rgba(0,0,0,1)'; }
  }

  function drawPointsPath(points) {
    if (!points || points.length < 1) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y + 0.01);
  }

  function drawSmoothPath(points) {
    if (!points || points.length < 2) { drawPointsPath(points); ctx.stroke(); return; }
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 2) { ctx.lineTo(points[1].x, points[1].y); ctx.stroke(); return; }
    for (var i = 1; i < points.length - 1; i++) {
      var mx = (points[i].x + points[i + 1].x) / 2;
      var my = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    var last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function drawStroke(s) {
    if (!s) return;
    ctx.save(); applyStrokeStyle(s);
    if (s.shape === 'line') {
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    } else if (s.shape === 'rect') {
      ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
    } else if (s.shape === 'ellipse') {
      var rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
      var cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); ctx.stroke();
    } else if (s.shape === 'polygon' || s.shape === 'regpoly') {
      var pts = s.shape === 'regpoly' ? regularPolyPoints(s) : s.points;
      if (!pts || pts.length < 2) { ctx.restore(); return; }
      drawPointsPath(pts); ctx.closePath(); ctx.stroke();
    } else if (s.shape === 'graph') {
      if (!s.points || s.points.length < 2) { ctx.restore(); return; }
      drawSmoothPath(s.points);
    } else {
      if (!s.points || s.points.length < 1) { ctx.restore(); return; }
      if (s.smooth) drawSmoothPath(s.points);
      else { drawPointsPath(s.points); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawPolygonPreview(poly) {
    var pts = poly.points;
    if (!pts || !pts.length) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = poly.ink; ctx.lineWidth = poly.size;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (poly.cursor) ctx.lineTo(poly.cursor.x, poly.cursor.y);
    ctx.stroke();
    ctx.fillStyle = poly.ink;
    pts.forEach(function (p) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, poly.size), 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }

  function regularPolyPoints(s) {
    var n = Math.max(3, Math.min(60, Math.round(Number(s.sides) || 6)));
    var cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
    var rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
    if (rx < 0.5) rx = 0.5; if (ry < 0.5) ry = 0.5;
    var pts = [], start = -Math.PI / 2;
    for (var i = 0; i < n; i++) {
      var a = start + (i * Math.PI * 2) / n;
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return pts;
  }

  function strokeBBox(s) {
    if (!s) return null;
    if (s.shape === 'line' || s.shape === 'rect' || s.shape === 'ellipse' || s.shape === 'regpoly') {
      return { minX: Math.min(s.x1, s.x2), minY: Math.min(s.y1, s.y2), maxX: Math.max(s.x1, s.x2), maxY: Math.max(s.y1, s.y2) };
    }
    var pts = s.points;
    if (!pts || !pts.length) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function getHandles(s) {
    if (!s) return [];
    if (s.shape === 'line') return [{ x: s.x1, y: s.y1, k: 'p1' }, { x: s.x2, y: s.y2, k: 'p2' }];
    if (s.shape === 'rect' || s.shape === 'ellipse') {
      return [{ x: s.x1, y: s.y1, k: 'nw' }, { x: s.x2, y: s.y1, k: 'ne' }, { x: s.x2, y: s.y2, k: 'se' }, { x: s.x1, y: s.y2, k: 'sw' }, { x: (s.x1+s.x2)/2, y: (s.y1+s.y2)/2, k: 'c' }];
    }
    if (s.shape === 'regpoly') {
      var rp = regularPolyPoints(s);
      return rp.map(function (p, i) { return { x: p.x, y: p.y, k: 'v' + i }; }).concat([{ x: (s.x1+s.x2)/2, y: (s.y1+s.y2)/2, k: 'c' }]);
    }
    if (s.shape === 'polygon' || s.shape === 'graph') {
      return (s.points || []).map(function (p, i) { return { x: p.x, y: p.y, k: 'v' + i }; });
    }
    var pts = s.points || [];
    if (pts.length <= 60) return pts.map(function (p, i) { return { x: p.x, y: p.y, k: 'v' + i }; });
    var step = Math.max(1, Math.round(pts.length / 48));
    var out = [];
    for (var i = 0; i < pts.length; i += step) out.push({ x: pts[i].x, y: pts[i].y, k: 'v' + i });
    if (out[out.length - 1].k !== 'v' + (pts.length - 1)) { var lp = pts[pts.length - 1]; out.push({ x: lp.x, y: lp.y, k: 'v' + (pts.length - 1) }); }
    return out;
  }

  function hitHandle(wp) {
    if (!state.selection) return null;
    var s = state.strokes[state.selection.index];
    if (!s) return null;
    var handles = getHandles(s);
    var thr = 8 / state.view.zoom;
    for (var i = 0; i < handles.length; i++) {
      var h = handles[i];
      if (Math.abs(wp.x - h.x) <= thr && Math.abs(wp.y - h.y) <= thr) return h;
    }
    return null;
  }

  function pointNearSegment(p, a, b, thr) {
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx*dx + dy*dy;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y) <= thr;
    var t = Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / l2));
    return Math.hypot(p.x - (a.x + t*dx), p.y - (a.y + t*dy)) <= thr;
  }

  function hitStroke(wp) {
    var thr = Math.max(6, 6 / state.view.zoom);
    for (var i = state.strokes.length - 1; i >= 0; i--) {
      var s = state.strokes[i];
      var bb = strokeBBox(s);
      if (bb && (wp.x < bb.minX - thr || wp.x > bb.maxX + thr || wp.y < bb.minY - thr || wp.y > bb.maxY + thr)) continue;
      if (s.shape === 'line') { if (pointNearSegment(wp, {x:s.x1,y:s.y1}, {x:s.x2,y:s.y2}, thr)) return i; }
      else if (s.shape === 'rect') {
        var r = [{x:s.x1,y:s.y1},{x:s.x2,y:s.y1},{x:s.x2,y:s.y2},{x:s.x1,y:s.y2}];
        for (var e = 0; e < 4; e++) if (pointNearSegment(wp, r[e], r[(e+1)%4], thr)) return i;
      } else if (s.shape === 'ellipse') {
        var cx = (s.x1+s.x2)/2, cy = (s.y1+s.y2)/2, rx = Math.max(1, Math.abs(s.x2-s.x1)/2), ry = Math.max(1, Math.abs(s.y2-s.y1)/2);
        var nx = (wp.x-cx)/rx, ny = (wp.y-cy)/ry, d = Math.abs(Math.sqrt(nx*nx+ny*ny)-1);
        if (d * Math.min(rx,ry) <= thr) return i;
      } else if (s.shape === 'regpoly' || s.shape === 'polygon') {
        var pts = s.shape === 'regpoly' ? regularPolyPoints(s) : s.points;
        if (!pts) continue;
        for (var j = 0; j < pts.length; j++) if (pointNearSegment(wp, pts[j], pts[(j+1)%pts.length], thr)) return i;
      } else {
        var fp = s.points;
        if (!fp) continue;
        for (var k = 1; k < fp.length; k++) if (pointNearSegment(wp, fp[k-1], fp[k], thr)) return i;
      }
    }
    return -1;
  }

  function applyHandleDrag(s, h, wp, startS) {
    if (!s || !h) return;
    if (s.shape === 'line') {
      if (h.k === 'p1') { s.x1 = wp.x; s.y1 = wp.y; } else { s.x2 = wp.x; s.y2 = wp.y; }
    } else if (s.shape === 'rect' || s.shape === 'ellipse') {
      if (h.k === 'nw') { s.x1 = wp.x; s.y1 = wp.y; }
      else if (h.k === 'ne') { s.x2 = wp.x; s.y1 = wp.y; }
      else if (h.k === 'se') { s.x2 = wp.x; s.y2 = wp.y; }
      else if (h.k === 'sw') { s.x1 = wp.x; s.y2 = wp.y; }
      else if (h.k === 'c' && startS) {
        var dx = wp.x - (startS.x1 + startS.x2)/2, dy = wp.y - (startS.y1 + startS.y2)/2;
        s.x1 = startS.x1 + dx; s.y1 = startS.y1 + dy; s.x2 = startS.x2 + dx; s.y2 = startS.y2 + dy;
      }
    } else if (s.shape === 'regpoly') {
      if (h.k === 'c' && startS) {
        var dx2 = wp.x - (startS.x1 + startS.x2)/2, dy2 = wp.y - (startS.y1 + startS.y2)/2;
        s.x1 = startS.x1 + dx2; s.y1 = startS.y1 + dy2; s.x2 = startS.x2 + dx2; s.y2 = startS.y2 + dy2;
      } else if (h.k.charAt(0) === 'v') {
        var pts = regularPolyPoints(startS || s);
        var vi = Number(h.k.slice(1));
        if (pts[vi]) { pts[vi] = { x: wp.x, y: wp.y }; s.shape = 'polygon'; s.points = pts; delete s.x1; delete s.y1; delete s.x2; delete s.y2; delete s.sides; }
      }
    } else if (s.shape === 'polygon' || s.shape === 'graph' || s.points) {
      var vi2 = Number(h.k.slice(1));
      if (s.points && s.points[vi2]) s.points[vi2] = { x: wp.x, y: wp.y };
    }
  }

  function drawSelection() {
    if (!state.selection || state.selection.type === 'item') return;
    var s = state.strokes[state.selection.index];
    if (!s) return;
    var bb = strokeBBox(s);
    if (bb) {
      ctx.save();
      ctx.strokeStyle = '#2f5ea8'; ctx.lineWidth = 1 / state.view.zoom; ctx.setLineDash([4 / state.view.zoom, 3 / state.view.zoom]);
      ctx.strokeRect(bb.minX - 4 / state.view.zoom, bb.minY - 4 / state.view.zoom, bb.maxX - bb.minX + 8 / state.view.zoom, bb.maxY - bb.minY + 8 / state.view.zoom);
      ctx.restore();
    }
    var handles = getHandles(s);
    var hs = 4 / state.view.zoom;
    ctx.save();
    for (var i = 0; i < handles.length; i++) {
      var h = handles[i];
      ctx.fillStyle = h.k === 'c' ? '#2f5ea8' : '#ffffff';
      ctx.strokeStyle = '#2f5ea8'; ctx.lineWidth = 1 / state.view.zoom;
      ctx.fillRect(h.x - hs, h.y - hs, hs*2, hs*2);
      ctx.strokeRect(h.x - hs, h.y - hs, hs*2, hs*2);
    }
    ctx.restore();
  }

  function pointInPoly(p, poly) {
    if (!poly || poly.length < 3) return false;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      var intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function bboxInPoly(bb, poly) {
    if (!bb) return false;
    var pts = [{x:bb.minX,y:bb.minY},{x:bb.maxX,y:bb.minY},{x:bb.maxX,y:bb.maxY},{x:bb.minX,y:bb.maxY},{x:(bb.minX+bb.maxX)/2,y:(bb.minY+bb.maxY)/2}];
    for (var i = 0; i < pts.length; i++) if (pointInPoly(pts[i], poly)) return true;
    return pointInPoly({x:(bb.minX+bb.maxX)/2,y:(bb.minY+bb.maxY)/2}, poly);
  }

  function translateStroke(s, dx, dy) {
    if (!s) return;
    if (s.shape === 'line' || s.shape === 'rect' || s.shape === 'ellipse' || s.shape === 'regpoly') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; return; }
    if (s.points) for (var i = 0; i < s.points.length; i++) { s.points[i].x += dx; s.points[i].y += dy; }
  }

  function computeLassoSelection(poly) {
    if (!poly || poly.length < 3) return { strokes: [], items: [] };
    var strokes = [], items = [];
    for (var i = 0; i < state.strokes.length; i++) if (bboxInPoly(strokeBBox(state.strokes[i]), poly)) strokes.push(i);
    for (var j = 0; j < state.items.length; j++) { var it = state.items[j]; if (pointInPoly({x:it.x, y:it.y}, poly)) items.push(j); }
    return { strokes: strokes, items: items };
  }

  function drawLasso() {
    if (!state.lasso || !state.lasso.points || state.lasso.points.length < 2) return;
    var pts = state.lasso.points;
    ctx.save();
    ctx.strokeStyle = '#2f5ea8'; ctx.fillStyle = 'rgba(47,94,168,0.06)';
    ctx.lineWidth = 1.5 / state.view.zoom; ctx.setLineDash([6 / state.view.zoom, 4 / state.view.zoom]);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (!state.lasso.active) ctx.closePath();
    ctx.stroke();
    if (!state.lasso.active) ctx.fill();
    ctx.restore();
  }

  function resampleStroke(points, spacing) {
    if (!points || points.length < 2) return points || [];
    var out = [points[0]], carry = 0;
    for (var i = 1; i < points.length; i++) {
      var a = points[i - 1], b = points[i];
      var seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (seg === 0) continue;
      var t = spacing - carry;
      while (t <= seg) {
        var u = t / seg;
        out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
        t += spacing;
      }
      carry = seg - (t - spacing);
      if (carry < 0) carry = 0;
    }
    var last = points[points.length - 1];
    var tail = out[out.length - 1];
    if (!tail || Math.hypot(last.x - tail.x, last.y - tail.y) > spacing * 0.25) out.push({ x: last.x, y: last.y });
    return out;
  }

  function movingAverage(points, win) {
    if (!points || points.length < 3) return points || [];
    var half = Math.max(1, Math.floor(win / 2));
    var out = [];
    for (var i = 0; i < points.length; i++) {
      var sx = 0, sy = 0, n = 0;
      for (var j = i - half; j <= i + half; j++) {
        if (j < 0 || j >= points.length) continue;
        sx += points[j].x; sy += points[j].y; n++;
      }
      out.push({ x: sx / n, y: sy / n });
    }
    out[0] = { x: points[0].x, y: points[0].y };
    out[out.length - 1] = { x: points[points.length - 1].x, y: points[points.length - 1].y };
    return out;
  }

  function solveLinear(A, b) {
    var n = A.length;
    var M = A.map(function (row, i) { return row.slice().concat([b[i]]); });
    for (var col = 0; col < n; col++) {
      var pivot = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      if (Math.abs(M[pivot][col]) < 1e-10) return null;
      if (pivot !== col) { var tmp = M[col]; M[col] = M[pivot]; M[pivot] = tmp; }
      var div = M[col][col];
      for (var c = col; c <= n; c++) M[col][c] /= div;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var f = M[r2][col];
        if (Math.abs(f) < 1e-12) continue;
        for (var c2 = col; c2 <= n; c2++) M[r2][c2] -= f * M[col][c2];
      }
    }
    return M.map(function (row) { return row[n]; });
  }

  function detectGraph(points, size) {
    if (!points || points.length < 8) return null;
    var rs = resampleStroke(points, Math.max(3, size * 1.2));
    var pts = movingAverage(rs, 5);
    if (pts.length < 8) pts = rs;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    var spanX = maxX - minX, spanY = maxY - minY;
    if (Math.max(spanX, spanY) < 18) return null;
    if (spanX < Math.max(spanY * 0.45, 24)) return null;
    var uniq = 0;
    for (var u = 1; u < pts.length; u++) if (Math.abs(pts[u].x - pts[u - 1].x) > 0.5) uniq++;
    if (uniq < pts.length * 0.45) return null;

    var s1 = 0, sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0;
    pts.forEach(function (p) {
      var x = p.x, y = p.y, x2 = x * x;
      s1++; sx += x; sx2 += x2; sx3 += x2 * x; sx4 += x2 * x2;
      sy += y; sxy += x * y; sx2y += x2 * y;
    });
    var lin = solveLinear([[s1, sx], [sx, sx2]], [sy, sxy]);
    var quad = solveLinear([[s1, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]], [sy, sxy, sx2y]);

    function rmse(pred) {
      if (!pred) return Infinity;
      var se = 0;
      pts.forEach(function (p) { var e = p.y - pred(p.x); se += e * e; });
      return Math.sqrt(se / pts.length);
    }
    var linFn = lin ? function (x) { return lin[0] + lin[1] * x; } : null;
    var quadFn = quad ? function (x) { return quad[0] + quad[1] * x + quad[2] * x * x; } : null;
    var eLin = rmse(linFn), eQuad = rmse(quadFn);
    var base = Math.max(spanY, size * 2, 8);
    var scale = spanX * spanX;
    var quadStrength = quad ? Math.abs(quad[2]) * scale : 0;
    var useQuad = quadFn && eQuad <= base * 0.22 && (quadStrength > Math.max(spanY * 0.18, 12) ? eQuad <= eLin * 0.92 : eQuad <= eLin * 0.75);
    var useLin = !useQuad && linFn && eLin <= base * 0.16;
    if (!useQuad && !useLin) return null;
    var fn = useQuad ? quadFn : linFn;
    var e = useQuad ? eQuad : eLin;
    if (e > base * 0.24) return null;
    var n = Math.max(24, Math.min(96, Math.round(spanX / 6)));
    var gpts = [];
    for (var i = 0; i <= n; i++) {
      var x = minX + (spanX * i) / n;
      gpts.push({ x: x, y: fn(x) });
    }
    return { shape: 'graph', ink: null, size: size, points: gpts, kind: useQuad ? 'quad' : 'linear' };
  }

  function detectCircle(points, size) {
    if (!points || points.length < 8) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, len = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      if (i > 0) { var dx = p.x - points[i-1].x, dy = p.y - points[i-1].y; len += Math.hypot(dx, dy); }
    }
    var w = maxX - minX, h = maxY - minY;
    var d = Math.max(w, h);
    if (d < 14 || len < 20) return null;
    var first = points[0], last = points[points.length - 1];
    var closure = Math.hypot(first.x - last.x, first.y - last.y);
    if (closure > Math.max(d * 0.28, size * 6, 18)) return null;
    var cx = 0, cy = 0;
    for (var j = 0; j < points.length; j++) { cx += points[j].x; cy += points[j].y; }
    cx /= points.length; cy /= points.length;
    var meanR = 0, radii = [];
    for (var k = 0; k < points.length; k++) {
      var r = Math.hypot(points[k].x - cx, points[k].y - cy);
      radii.push(r); meanR += r;
    }
    meanR /= radii.length;
    if (meanR < 6) return null;
    var variance = 0;
    for (var m = 0; m < radii.length; m++) variance += (radii[m] - meanR) * (radii[m] - meanR);
    var std = Math.sqrt(variance / radii.length);
    var aspect = Math.min(w, h) / Math.max(w, h);
    var tol = Math.max(meanR * 0.18, size * 1.2, 3);
    if (std > tol) return null;
    var circ = 2 * Math.PI * meanR;
    if (len < circ * 0.55) return null;
    if (aspect >= 0.78) {
      var rOut = meanR + size * 0.15;
      return { shape: 'ellipse', ink: null, size: size, x1: cx - rOut, y1: cy - rOut, x2: cx + rOut, y2: cy + rOut };
    }
    return { shape: 'ellipse', ink: null, size: size, x1: minX, y1: minY, x2: maxX, y2: maxY };
  }

  function recognizeCurve(points, size) {
    if (!points || points.length < 6) return points;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, len = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      if (i > 0) { var dx = p.x - points[i-1].x, dy = p.y - points[i-1].y; len += Math.sqrt(dx*dx + dy*dy); }
    }
    var w = maxX - minX, h = maxY - minY;
    if (Math.max(w, h) < 12 || len < 12) return points;
    // Ramer-Douglas-Peucker simplify
    var eps = Math.max(1.5, Math.min(w, h) * 0.012, size * 0.6);
    var simple = rdp(points, eps);
    return simple.length >= 2 ? simple : points;
  }
  function rdp(points, eps) {
    if (points.length <= 2) return points;
    var maxD = 0, idx = 0;
    var a = points[0], b = points[points.length - 1];
    for (var i = 1; i < points.length - 1; i++) {
      var d = perpDist(points[i], a, b);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps) {
      var l = rdp(points.slice(0, idx + 1), eps);
      var r = rdp(points.slice(idx), eps);
      return l.slice(0, -1).concat(r);
    }
    return [a, b];
  }
  function perpDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function zoomAt(factor, cx, cy) {
    var old = state.view.zoom, next = clamp(old * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === old) return;
    state.view.x = cx - (cx - state.view.x) * (next / old);
    state.view.y = cy - (cy - state.view.y) * (next / old);
    state.view.zoom = next; redraw();
  }
  function resetZoom() { state.view = { x: 0, y: 0, zoom: 1 }; redraw(); }

  function finalizePolygon() {
    if (!state.polygon || state.polygon.points.length < 3) { cancelPolygon(); redraw(); return; }
    pushUndo();
    state.strokes.push({ shape: 'polygon', ink: state.polygon.ink, size: state.polygon.size, points: state.polygon.points.slice() });
    cancelPolygon(); redraw();
  }

  function onDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (state.placing) return;
    var wp = worldPoint(e.clientX, e.clientY);
    var tool = (state.spacePan || e.button === 1) ? 'pan' : state.tool;
    if (tool === 'pan') {
      canvas.setPointerCapture(e.pointerId);
      state.panning = true;
      state.panStart = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y };
      canvas.style.cursor = 'grabbing'; return;
    }
    if (tool === 'select') {
      var hh = hitHandle(wp);
      if (hh && state.selection) {
        canvas.setPointerCapture(e.pointerId);
        state.draggingHandle = hh;
        state.dragSnapshot = JSON.parse(JSON.stringify(state.strokes[state.selection.index]));
        pushUndo();
        return;
      }
      var hi = hitStroke(wp);
      state.selection = hi >= 0 ? { index: hi } : null;
      state.lasso = null;
      redraw(); return;
    }
    if (tool === 'lasso') {
      canvas.setPointerCapture(e.pointerId);
      if (state.lasso && !state.lasso.active && state.lasso.points && state.lasso.points.length >= 3) {
        var sel = state.lasso.selection || computeLassoSelection(state.lasso.points);
        if (pointInPoly(wp, state.lasso.points) && (sel.strokes.length || sel.items.length)) {
          pushUndo();
          state.lassoMove = { x: wp.x, y: wp.y, selection: sel };
          return;
        }
      }
      state.selection = null;
      state.lasso = { active: true, points: [wp], selection: null };
      redraw(); return;
    }
    if (tool === 'polygon') {
      if (!state.polygon) state.polygon = { points: [], cursor: wp, ink: state.ink, size: state.size };
      var pts = state.polygon.points;
      if (pts.length >= 3) {
        var first = pts[0];
        var d = Math.hypot(wp.x - first.x, wp.y - first.y);
        if (d < 10 / state.view.zoom) { finalizePolygon(); return; }
      }
      pts.push({ x: wp.x, y: wp.y });
      state.polygon.cursor = wp;
      redraw(); return;
    }
    canvas.setPointerCapture(e.pointerId);
    if (tool === 'text') { placeTextAt(wp.x, wp.y); return; }
    state.drawing = true;
    if (tool === 'line' || tool === 'rect' || tool === 'ellipse' || tool === 'regpoly') {
      var sides = tool === 'regpoly' ? Math.max(3, Math.min(60, Math.round(Number(state.polySides) || 6))) : null;
      state.current = { shape: tool, ink: state.ink, size: state.size, x1: wp.x, y1: wp.y, x2: wp.x, y2: wp.y, shift: e.shiftKey, sides: sides };
    } else {
      state.current = { ink: state.ink, size: tool === 'eraser' ? Math.max(state.size * 6, 14) : state.size, erase: tool === 'eraser', points: [wp] };
    }
  }

  function onMove(e) {
    var wp = worldPoint(e.clientX, e.clientY);
    statusPos.textContent = Math.round(wp.x) + ', ' + Math.round(wp.y);
    if (state.panning && state.panStart) {
      state.view.x = state.panStart.vx + (e.clientX - state.panStart.x);
      state.view.y = state.panStart.vy + (e.clientY - state.panStart.y);
      redraw(); return;
    }
    if (state.lassoMove && state.lasso) {
      var dxm = wp.x - state.lassoMove.x, dym = wp.y - state.lassoMove.y;
      var selm = state.lassoMove.selection;
      for (var si = 0; si < selm.strokes.length; si++) translateStroke(state.strokes[selm.strokes[si]], dxm, dym);
      for (var ii = 0; ii < selm.items.length; ii++) { var itm = state.items[selm.items[ii]]; if (itm) { itm.x += dxm; itm.y += dym; } }
      for (var pi = 0; pi < state.lasso.points.length; pi++) { state.lasso.points[pi].x += dxm; state.lasso.points[pi].y += dym; }
      state.lassoMove.x = wp.x; state.lassoMove.y = wp.y;
      renderOverlay(); redraw(); return;
    }
    if (state.lasso && state.lasso.active) {
      var lp = state.lasso.points;
      var lastp = lp[lp.length - 1];
      if (!lastp || Math.hypot(wp.x - lastp.x, wp.y - lastp.y) >= 2 / state.view.zoom) { lp.push(wp); redraw(); }
      return;
    }
    if (state.draggingHandle && state.selection && state.selection.type !== 'item') {
      var s = state.strokes[state.selection.index];
      if (s) applyHandleDrag(s, state.draggingHandle, wp, state.dragSnapshot);
      redraw(); return;
    }
    if (state.draggingItem) {
      var it = state.items[state.draggingItem.index];
      if (it) { it.x = state.draggingItem.startX + (wp.x - state.draggingItem.startWp.x); it.y = state.draggingItem.startY + (wp.y - state.draggingItem.startWp.y); renderOverlay(); }
      return;
    }
    if (state.tool === 'select' && state.selection && state.selection.type !== 'item') {
      var over = hitHandle(wp);
      canvas.style.cursor = over ? (over.k === 'c' ? 'move' : 'crosshair') : 'default';
    }
    if (state.polygon) { state.polygon.cursor = wp; redraw(); return; }
    if (!state.drawing || !state.current) return;
    if (state.current.shape) {
      state.current.shift = e.shiftKey;
      state.current.x2 = wp.x; state.current.y2 = wp.y;
      var dx = wp.x - state.current.x1, dy = wp.y - state.current.y1;
      if (state.current.shape === 'line' && e.shiftKey) {
        var ang = Math.atan2(dy, dx);
        var snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        var len = Math.sqrt(dx * dx + dy * dy);
        state.current.x2 = state.current.x1 + Math.cos(snap) * len;
        state.current.y2 = state.current.y1 + Math.sin(snap) * len;
      } else if ((state.current.shape === 'rect' || state.current.shape === 'regpoly') && e.shiftKey) {
        var s = Math.max(Math.abs(dx), Math.abs(dy));
        state.current.x2 = state.current.x1 + (dx < 0 ? -s : s);
        state.current.y2 = state.current.y1 + (dy < 0 ? -s : s);
      } else if (state.current.shape === 'ellipse' && e.shiftKey) {
        // Shift = perfect circle only (requested)
        var r = Math.max(Math.abs(dx), Math.abs(dy));
        state.current.x2 = state.current.x1 + (dx < 0 ? -r : r);
        state.current.y2 = state.current.y1 + (dy < 0 ? -r : r);
      }
      redraw(); return;
    }
    var last = state.current.points[state.current.points.length - 1];
    var ddx = wp.x - last.x, ddy = wp.y - last.y;
    var minDist = 1.0 / state.view.zoom;
    if (ddx * ddx + ddy * ddy < minDist * minDist) return;
    state.current.points.push(wp); redraw();
  }

  function onUp() {
    if (state.panning) { state.panning = false; state.panStart = null; setTool(state.tool); return; }
    if (state.lassoMove) { state.lassoMove = null; return; }
    if (state.lasso && state.lasso.active) {
      state.lasso.active = false;
      state.lasso.selection = computeLassoSelection(state.lasso.points);
      if (state.lasso.points.length < 3 || (!state.lasso.selection.strokes.length && !state.lasso.selection.items.length)) state.lasso = null;
      redraw(); return;
    }
    if (state.draggingHandle) { state.draggingHandle = null; state.dragSnapshot = null; redraw(); return; }
    if (state.draggingItem) { state.draggingItem = null; return; }
    if (!state.drawing) return;
    state.drawing = false;
    if (state.current) {
      if (state.current.shape) {
        pushUndo(); state.strokes.push(state.current);
      } else if (state.current.points && state.current.points.length) {
        if (state.curve && !state.current.erase && state.current.points.length >= 6) {
          var circle = detectCircle(state.current.points, state.current.size);
          if (circle) {
            circle.ink = state.current.ink;
            pushUndo(); state.strokes.push(circle);
          } else {
            var graph = detectGraph(state.current.points, state.current.size);
            if (graph) {
              graph.ink = state.current.ink;
              pushUndo(); state.strokes.push(graph);
            } else {
              state.current.points = recognizeCurve(state.current.points, state.current.size);
              state.current.smooth = true;
              pushUndo(); state.strokes.push(state.current);
            }
          }
        } else {
          pushUndo(); state.strokes.push(state.current);
        }
      }
    }
    state.current = null; redraw();
  }

  function onDblClick(e) {
    if (state.tool === 'polygon' && state.polygon) { e.preventDefault(); finalizePolygon(); }
  }

  function placeTextAt(x, y) {
    var text = (mathInput.value || '').trim();
    if (!text) { var created = prompt('텍스트 입력', ''); if (created == null) return; text = created.trim(); }
    if (!text) return;
    pushUndo(); state.items.push({ x: x, y: y, text: text }); renderOverlay();
    if (state.placing) { state.placing = false; mathInput.value = ''; }
  }

  function renderOverlay() {
    overlay.style.transform = 'translate(' + state.view.x + 'px,' + state.view.y + 'px) scale(' + state.view.zoom + ')';
    overlay.innerHTML = '';
    state.items.forEach(function (item, idx) {
      var el = document.createElement('div');
      var selected = state.selection && state.selection.type === 'item' && state.selection.index === idx;
      el.className = 'note-item' + (selected ? ' selected' : '');
      el.style.left = item.x + 'px'; el.style.top = item.y + 'px';
      el.textContent = item.text; el.title = '선택(V) 후 꼭짓점(이동점) 드래그 / 더블클릭 편집 / 우클릭 삭제';
      el.addEventListener('pointerdown', function (ev) {
        if (state.tool !== 'select') return;
        ev.stopPropagation(); ev.preventDefault();
        state.selection = { type: 'item', index: idx };
        pushUndo();
        var wp = worldPoint(ev.clientX, ev.clientY);
        state.draggingItem = { index: idx, startWp: wp, startX: item.x, startY: item.y };
        canvas.setPointerCapture(ev.pointerId);
        renderOverlay(); redraw();
      });
      el.addEventListener('dblclick', function (ev) {
        ev.stopPropagation();
        var next = prompt('텍스트 편집', item.text); if (next == null) return;
        pushUndo(); item.text = next; renderOverlay();
      });
      el.addEventListener('contextmenu', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (confirm('이 텍스트를 삭제할까요?')) { pushUndo(); state.items.splice(idx, 1); if (state.selection && state.selection.type === 'item') state.selection = null; renderOverlay(); redraw(); }
      });
      overlay.appendChild(el);
      if (selected) {
        var h = document.createElement('div');
        h.className = 'item-handle';
        h.style.left = item.x + 'px'; h.style.top = item.y + 'px';
        h.addEventListener('pointerdown', function (ev) {
          if (state.tool !== 'select') return;
          ev.stopPropagation(); ev.preventDefault();
          pushUndo();
          var wp = worldPoint(ev.clientX, ev.clientY);
          state.draggingItem = { index: idx, startWp: wp, startX: item.x, startY: item.y };
          canvas.setPointerCapture(ev.pointerId);
        });
        overlay.appendChild(h);
      }
    });
  }

  function insertAtCursor(input, text) {
    var start = input.selectionStart == null ? input.value.length : input.selectionStart;
    var end = input.selectionEnd == null ? input.value.length : input.selectionEnd;
    var v = input.value; input.value = v.slice(0, start) + text + v.slice(end);
    input.focus(); var pos = start + text.length; input.setSelectionRange(pos, pos);
  }

  function buildMath() {
    var twrap = document.getElementById('math-templates');
    TEMPLATES.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sym template'; b.textContent = t.label; b.title = t.value;
      b.addEventListener('click', function () { insertAtCursor(mathInput, t.value); }); twrap.appendChild(b);
    });
    var swrap = document.getElementById('math-symbols');
    SYMBOLS.forEach(function (sym) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sym'; b.textContent = sym; b.title = '삽입: ' + sym;
      b.addEventListener('click', function () { insertAtCursor(mathInput, sym); }); swrap.appendChild(b);
    });
  }

  function safeCalc(expr) {
    var src = (expr || '').trim(); if (!src) return '';
    var s = src.replace(/π/g, 'PI').replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/√\(/g, 'sqrt(');
    if (!/^[0-9+\-*/().,%\sA-Za-z_**]+$/.test(s)) throw new Error('허용되지 않는 문자');
    var fn = new Function('abs,acos,asin,atan,atan2,ceil,cos,exp,floor,log,log10,max,min,pow,round,sin,sqrt,tan,PI,E', '"use strict"; return (' + s + ');');
    var v = fn(Math.abs,Math.acos,Math.asin,Math.atan,Math.atan2,Math.ceil,Math.cos,Math.exp,Math.floor,Math.log,Math.log10,Math.max,Math.min,Math.pow,Math.round,Math.sin,Math.sqrt,Math.tan,Math.PI,Math.E);
    if (typeof v === 'number' && !isFinite(v)) throw new Error('결과가 유한하지 않음');
    if (typeof v === 'number') return Math.round(v * 1e12) / 1e12;
    return String(v);
  }
  function runCalc() {
    try { var out = safeCalc(calcInput.value); calcResult.textContent = out === '' ? '' : '= ' + out; calcResult.dataset.value = String(out); }
    catch (e) { calcResult.textContent = '오류'; calcResult.dataset.value = ''; }
  }

  function saveFile() {
    var data = JSON.stringify({ version: 3, strokes: state.strokes, items: state.items, view: state.view, grid: state.grid, curve: state.curve }, null, 2);
    var blob = new Blob([data], { type: 'application/json' }); var a = document.createElement('a');
    var now = new Date(); var stamp = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    a.href = URL.createObjectURL(blob); a.download = 'note-' + stamp + '.notemath.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 0);
  }
  function openFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result); pushUndo();
        state.strokes = Array.isArray(data.strokes) ? data.strokes : [];
        state.items = Array.isArray(data.items) ? data.items : [];
        if (data.view && typeof data.view.zoom === 'number') state.view = data.view;
        state.grid = !!data.grid; state.curve = !!data.curve;
        document.getElementById('grid-toggle').classList.toggle('active', state.grid);
        document.getElementById('grid-toggle').setAttribute('aria-pressed', state.grid ? 'true' : 'false');
        document.getElementById('curve-toggle').classList.toggle('active', state.curve);
        document.getElementById('curve-toggle').setAttribute('aria-pressed', state.curve ? 'true' : 'false');
        cancelPolygon(); redraw();
      } catch (e) { alert('파일을 열 수 없습니다.'); }
    };
    reader.readAsText(file);
  }

  document.querySelectorAll('.tool[data-tool]').forEach(function (b) {
    b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
  });
  document.querySelectorAll('.swatch').forEach(function (b) {
    b.addEventListener('click', function () {
      state.ink = b.getAttribute('data-ink');
      document.querySelectorAll('.swatch').forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active');
      if (state.tool === 'eraser' || state.tool === 'pan') setTool('pen');
    });
  });
  document.getElementById('size').addEventListener('input', function (e) { state.size = Number(e.target.value) || 2; });
  var polySidesInput = document.getElementById('poly-sides');
  if (polySidesInput) polySidesInput.addEventListener('change', function (e) {
    var n = Math.max(3, Math.min(60, Math.round(Number(e.target.value) || 6)));
    state.polySides = n; e.target.value = n;
  });
  mathToggle.addEventListener('click', function () {
    var open = mathPanel.hasAttribute('hidden');
    if (open) mathPanel.removeAttribute('hidden'); else mathPanel.setAttribute('hidden', '');
    mathToggle.setAttribute('aria-expanded', open ? 'true' : 'false'); mathToggle.classList.toggle('active', open);
    if (open) mathInput.focus();
  });
  document.getElementById('grid-toggle').addEventListener('click', function () {
    state.grid = !state.grid; this.classList.toggle('active', state.grid); this.setAttribute('aria-pressed', state.grid ? 'true' : 'false'); redraw();
  });
  document.getElementById('curve-toggle').addEventListener('click', function () {
    state.curve = !state.curve; this.classList.toggle('active', state.curve); this.setAttribute('aria-pressed', state.curve ? 'true' : 'false');
    statusTool.textContent = state.curve ? (TOOL_NAMES[state.tool] + ' · 곡선 인식') : (TOOL_NAMES[state.tool] || state.tool);
  });
  document.getElementById('math-place').addEventListener('click', function () {
    if (!(mathInput.value || '').trim()) { mathInput.focus(); return; }
    state.placing = true; setTool('text'); statusTool.textContent = '배치: 캔버스 클릭';
  });
  mathInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('math-place').click(); } });
  document.getElementById('calc-run').addEventListener('click', runCalc);
  calcInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runCalc(); } });
  document.getElementById('calc-place').addEventListener('click', function () {
    runCalc(); var v = calcResult.dataset.value; if (!v) return;
    var expr = (calcInput.value || '').trim();
    mathInput.value = expr ? (expr + ' = ' + v) : v;
    state.placing = true; setTool('text'); statusTool.textContent = '배치: 캔버스 클릭';
  });

  document.getElementById('zoom-in').addEventListener('click', function () { var r = stage.getBoundingClientRect(); zoomAt(1.2, r.width/2, r.height/2); });
  document.getElementById('zoom-out').addEventListener('click', function () { var r = stage.getBoundingClientRect(); zoomAt(1/1.2, r.width/2, r.height/2); });
  zoomReadout.addEventListener('click', resetZoom);
  document.getElementById('undo').addEventListener('click', function () {
    if (state.polygon && state.polygon.points.length) { state.polygon.points.pop(); redraw(); return; }
    if (!state.undo.length) return;
    state.redo.push(JSON.stringify({ strokes: state.strokes, items: state.items, view: state.view })); restore(state.undo.pop());
  });
  document.getElementById('redo').addEventListener('click', function () {
    if (!state.redo.length) return;
    state.undo.push(JSON.stringify({ strokes: state.strokes, items: state.items, view: state.view })); restore(state.redo.pop());
  });
  document.getElementById('clear').addEventListener('click', function () {
    if (!state.strokes.length && !state.items.length && !state.polygon) return;
    if (!confirm('현재 페이지를 지울까요?')) return;
    pushUndo(); state.strokes = []; state.items = []; cancelPolygon(); redraw();
  });
  document.getElementById('save').addEventListener('click', saveFile);
  document.getElementById('open').addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function (e) { openFile(e.target.files[0]); e.target.value = ''; });

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', function () { if (state.drawing || state.panning) onUp(); });
  canvas.addEventListener('dblclick', onDblClick);
  stage.addEventListener('click', function (e) {
    if (!state.placing) return;
    if (e.target.closest('.note-item')) return;
    var wp = worldPoint(e.clientX, e.clientY); placeTextAt(wp.x, wp.y);
  });
  stage.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return; e.preventDefault();
    var r = canvas.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    var inInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (e.key === 'Escape' && state.polygon) { e.preventDefault(); cancelPolygon(); redraw(); return; }
    if (e.key === 'Escape' && state.lasso) { e.preventDefault(); state.lasso = null; redraw(); return; }
    if (e.key === 'Escape' && state.selection) { e.preventDefault(); state.selection = null; redraw(); return; }
    if (e.code === 'Space' && !inInput && !state.spacePan) { e.preventDefault(); state.spacePan = true; if (!state.drawing) canvas.style.cursor = 'grab'; return; }
    if (inInput) return;
    var k = e.key.toLowerCase();
    if ((k === 'delete' || k === 'backspace') && state.lasso && state.lasso.selection) {
      e.preventDefault(); pushUndo();
      var lsel = state.lasso.selection;
      lsel.strokes.slice().sort(function(a,b){return b-a;}).forEach(function(i){ state.strokes.splice(i,1); });
      lsel.items.slice().sort(function(a,b){return b-a;}).forEach(function(i){ state.items.splice(i,1); });
      state.lasso = null; redraw(); renderOverlay(); return;
    }
    if ((k === 'delete' || k === 'backspace') && state.selection) {
      e.preventDefault(); pushUndo();
      if (state.selection.type === 'item') state.items.splice(state.selection.index, 1);
      else state.strokes.splice(state.selection.index, 1);
      state.selection = null; redraw(); renderOverlay(); return;
    }
    if (e.ctrlKey && k === 'z') { e.preventDefault(); document.getElementById('undo').click(); }
    else if (e.ctrlKey && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); document.getElementById('redo').click(); }
    else if (e.ctrlKey && k === 's') { e.preventDefault(); saveFile(); }
    else if (e.ctrlKey && (k === '=' || k === '+')) { e.preventDefault(); var r = stage.getBoundingClientRect(); zoomAt(1.2, r.width/2, r.height/2); }
    else if (e.ctrlKey && k === '-') { e.preventDefault(); var r2 = stage.getBoundingClientRect(); zoomAt(1/1.2, r2.width/2, r2.height/2); }
    else if (e.ctrlKey && k === '0') { e.preventDefault(); resetZoom(); }
    else if (k === 'q') setTool('lasso');
    else if (k === 'v') setTool('select');
    else if (k === 'p') setTool('pen');
    else if (k === 'e') setTool('eraser');
    else if (k === 't') setTool('text');
    else if (k === 'l') setTool('line');
    else if (k === 'r') setTool('rect');
    else if (k === 'o') setTool('ellipse');
    else if (k === 'y') setTool('polygon');
    else if (k === 'n') setTool('regpoly');
    else if (k === 'h') setTool('pan');
    else if (k === 'm') mathToggle.click();
    else if (k === 'g') document.getElementById('grid-toggle').click();
    else if (k === 'c') document.getElementById('curve-toggle').click();
    else if (k === 'enter' && state.polygon) { e.preventDefault(); finalizePolygon(); }
  });
  window.addEventListener('keyup', function (e) { if (e.code === 'Space') { state.spacePan = false; if (!state.panning) setTool(state.tool); } });
  window.addEventListener('resize', resize);
  buildMath(); setTool('pen'); resize();
})();
