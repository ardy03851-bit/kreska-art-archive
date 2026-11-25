/* kres+ custom brushes and small-screen popover controls.
   Brushes registered on window.brushes before core loads are automatically
   organized into categories and persisted by the drawing engine. */
(function () {
  "use strict";

  var brushes = window.brushes = window.brushes || {};

  var TIP_SIZE = 128;
  var tipTables = null;
  var glossCanvas = null;
  var glossCtx = null;
  var glossImageData = null;
  var lastGlossKey = "";
  var smoothCanvas = null;
  var smoothCtx = null;
  var smoothImageData = null;
  var lastSmoothKey = "";
  var eraseCanvas = null;
  var currentHex = "#000000";
  var isDot = false;

  function smoothstep(edge0, edge1, x) {
    var t = (x - edge0) / (edge1 - edge0);
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return t * t * (3 - 2 * t);
  }

  function clampByte(v) {
    return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
  }

  function parseColor(color) {
    if (typeof color === "string") {
      var s = color.trim();
      if (s.charAt(0) === "#") {
        var hex = s.slice(1);
        if (hex.length === 3) {
          hex = hex.charAt(0) + hex.charAt(0) +
                hex.charAt(1) + hex.charAt(1) +
                hex.charAt(2) + hex.charAt(2);
        }
        if (hex.length >= 6) {
          var num = parseInt(hex.slice(0, 6), 16);
          if (!isNaN(num)) {
            return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
          }
        }
      } else if (s.indexOf("rgb") === 0) {
        var parts = s.match(/\d+(\.\d+)?/g);
        if (parts && parts.length >= 3) {
          return {
            r: clampByte(parseFloat(parts[0])),
            g: clampByte(parseFloat(parts[1])),
            b: clampByte(parseFloat(parts[2]))
          };
        }
      }
    }
    return { r: 0, g: 0, b: 0 };
  }

  function ensureTipTables() {
    if (tipTables) return tipTables;
    var count = TIP_SIZE * TIP_SIZE;
    var alpha = new Uint8Array(count);
    var upper = new Float32Array(count);
    var lower = new Float32Array(count);
    var bevel = new Float32Array(count);
    var gloss = new Float32Array(count);
    var spec = new Float32Array(count);
    var half = TIP_SIZE * 0.5;

    for (var y = 0; y < TIP_SIZE; y++) {
      var ny = (y + 0.5 - half) / half;
      for (var x = 0; x < TIP_SIZE; x++) {
        var idx = y * TIP_SIZE + x;
        var nx = (x + 0.5 - half) / half;
        var r = Math.hypot(nx, ny);
        if (r >= 1) continue;

        var a = 1 - smoothstep(0.76, 1.0, r);
        alpha[idx] = clampByte(a * 255);

        if (ny < -0.56) {
          upper[idx] = smoothstep(-0.56, -1.0, ny) * 0.85;
        } else if (ny > 0.56) {
          lower[idx] = smoothstep(0.56, 1.0, ny);
        }

        var rimGuard = 1 - smoothstep(0.54, 0.85, r);
        var dSpec = Math.abs(ny + 0.38 - 0.16 * nx * nx);
        if (dSpec < 0.28 && rimGuard > 0) {
          gloss[idx] = (1 - smoothstep(0, 0.28, dSpec)) * rimGuard * 0.76;
          spec[idx] = (1 - smoothstep(0, 0.10, dSpec)) * rimGuard * 0.64;
        }

        if (r > 0.78) {
          bevel[idx] = smoothstep(0.78, 0.98, r) * 0.32;
        }
      }
    }

    tipTables = {
      count: count,
      alpha: alpha,
      upper: upper,
      lower: lower,
      bevel: bevel,
      gloss: gloss,
      spec: spec
    };
    return tipTables;
  }

  function createOffscreenCanvas() {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      return null;
    }
    var canvas = document.createElement("canvas");
    canvas.width = TIP_SIZE;
    canvas.height = TIP_SIZE;
    return canvas;
  }

  function getEraseTip() {
    if (eraseCanvas) return eraseCanvas;
    eraseCanvas = createOffscreenCanvas();
    if (!eraseCanvas) return null;
    var ctx = eraseCanvas.getContext("2d");
    var tables = ensureTipTables();
    var img = ctx.createImageData(TIP_SIZE, TIP_SIZE);
    var data = img.data;
    for (var i = 0; i < tables.count; i++) {
      var a = tables.alpha[i];
      if (a === 0) continue;
      var p = i * 4;
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    return eraseCanvas;
  }

  function getSmoothTip(colorStr) {
    if (!smoothCanvas) {
      smoothCanvas = createOffscreenCanvas();
      if (!smoothCanvas) return null;
      smoothCtx = smoothCanvas.getContext("2d");
      smoothImageData = smoothCtx.createImageData(TIP_SIZE, TIP_SIZE);
    }
    if (colorStr === lastSmoothKey) return smoothCanvas;
    lastSmoothKey = colorStr;

    var rgb = parseColor(colorStr);
    var tables = ensureTipTables();
    var data = smoothImageData.data;
    for (var i = 0; i < tables.count; i++) {
      var a = tables.alpha[i];
      var p = i * 4;
      if (a === 0) {
        data[p + 3] = 0;
        continue;
      }
      data[p] = rgb.r;
      data[p + 1] = rgb.g;
      data[p + 2] = rgb.b;
      data[p + 3] = a;
    }
    smoothCtx.putImageData(smoothImageData, 0, 0);
    return smoothCanvas;
  }

  function getGlossTip(colorStr) {
    if (!glossCanvas) {
      glossCanvas = createOffscreenCanvas();
      if (!glossCanvas) return null;
      glossCtx = glossCanvas.getContext("2d");
      glossImageData = glossCtx.createImageData(TIP_SIZE, TIP_SIZE);
    }
    if (colorStr === lastGlossKey) return glossCanvas;
    lastGlossKey = colorStr;

    var rgb = parseColor(colorStr);
    var br = rgb.r / 255;
    var bg = rgb.g / 255;
    var bb = rgb.b / 255;
    var lum = 0.299 * br + 0.587 * bg + 0.114 * bb;

    var hiAmt = lum < 0.85 ? 0.42 : 0.28;
    var specAmt = lum < 0.88 ? 0.68 : 0.48;
    var deepScale = 1 - (lum > 0.12 ? 0.17 : 0.36);
    var upperScale = 1 - (lum > 0.12 ? 0.10 : 0.20);

    var hiR = br + (1 - br) * hiAmt;
    var hiG = bg + (1 - bg) * hiAmt;
    var hiB = bb + (1 - bb) * hiAmt;

    var spR = br + (1 - br) * specAmt;
    var spG = bg + (1 - bg) * specAmt;
    var spB = bb + (1 - bb) * specAmt;

    var dpR = br * deepScale;
    var dpG = bg * deepScale;
    var dpB = bb * deepScale;

    var upR = br * upperScale;
    var upG = bg * upperScale;
    var upB = bb * upperScale;

    var tables = ensureTipTables();
    var data = glossImageData.data;

    for (var i = 0; i < tables.count; i++) {
      var a = tables.alpha[i];
      var p = i * 4;
      if (a === 0) {
        data[p + 3] = 0;
        continue;
      }

      var r = br;
      var g = bg;
      var b = bb;

      var u = tables.upper[i];
      var l = tables.lower[i];
      if (u > 0) {
        r += (upR - r) * u;
        g += (upG - g) * u;
        b += (upB - b) * u;
      } else if (l > 0) {
        r += (dpR - r) * l;
        g += (dpG - g) * l;
        b += (dpB - b) * l;
      }

      var gl = tables.gloss[i];
      if (gl > 0) {
        r += (hiR - r) * gl;
        g += (hiG - g) * gl;
        b += (hiB - b) * gl;
        var sp = tables.spec[i];
        if (sp > 0) {
          r += (spR - r) * sp;
          g += (spG - g) * sp;
          b += (spB - b) * sp;
        }
      }

      var bv = tables.bevel[i];
      if (bv > 0) {
        r += (dpR - r) * bv;
        g += (dpG - g) * bv;
        b += (dpB - b) * bv;
      }

      data[p] = clampByte(r * 255);
      data[p + 1] = clampByte(g * 255);
      data[p + 2] = clampByte(b * 255);
      data[p + 3] = a;
    }

    glossCtx.putImageData(glossImageData, 0, 0);
    return glossCanvas;
  }

  brushes.kb_20250 = {
    id: "kb_20250",
    enabled: true,
    name: "glossy acrylic",
    category: "acrylic paint",
    css: "new",
    type: "direct",
    gradient: true,
    opacity: 1,
    lineWidth: 64,
    max_width: 200,
    min_width: 4,
    spacing: 26,
    rotation: "follow",
    rotation_lerp: 0.18,
    erase: false,
    auto_color: false,
    pressure: true,
    opacity_control: false,
    default_opacity: 0.58,
    lerp: 0.6,
    wet_paint_dilution: 0.08,
    color: function (color) {
      if (color) currentHex = String(color);
      if (!this.erase && !this.blend) {
        getGlossTip(currentHex);
      } else if (this.blend) {
        getSmoothTip(currentHex);
      }
    },
    image: function (ctx, size, pos) {
      if (!ctx || !(size > 0) || !pos || !isFinite(pos.x) || !isFinite(pos.y)) return;
      var radius = size * 0.5;
      var tip = this.erase
        ? getEraseTip()
        : this.blend
          ? getSmoothTip(currentHex)
          : getGlossTip(currentHex);

      if (tip) {
        if (isDot) {
          var prevAlpha = ctx.globalAlpha;
          ctx.globalAlpha = 1;
          ctx.drawImage(tip, pos.x - radius, pos.y - radius, size, size);
          ctx.globalAlpha = prevAlpha;
        } else {
          ctx.drawImage(tip, pos.x - radius, pos.y - radius, size, size);
        }
      } else {
        ctx.fillStyle = currentHex;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    down: function (t) {
      isDot = false;
      brushes.common.down(t);
    },
    move: function (t) {
      brushes.common.move(t);
    },
    up: function (t) {
      brushes.common.up(t);
    },
    dot: function (t) {
      isDot = true;
      if (typeof brushes.common.__eWJtGt === "function") {
        brushes.common.__eWJtGt(t, -0.35);
        brushes.common.up(t);
      } else {
        brushes.common.dot(t);
      }
    },
    end: function () {
      isDot = false;
    }
  };

  /* Small-screen popovers need their own scrolling: the archived drawing engine
     prevents native touch scrolling so gestures cannot accidentally paint. */
  var gesture = null;
  var popupSelector = "#guides_inner, #font_inner";

  function scrollablePopup(target) {
    var popup = target instanceof Element ? target.closest(popupSelector) : null;
    return popup && popup.scrollHeight > popup.clientHeight ? popup : null;
  }

  window.addEventListener("pointerdown", function (event) {
    if (!event.isPrimary) return;
    gesture = null;
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    var popup = scrollablePopup(event.target);
    if (!popup) return;
    gesture = {
      popup: popup,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startY: event.clientY,
      startScroll: popup.scrollTop,
      scrolling: false
    };
  }, true);

  window.addEventListener("pointermove", function (event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    var distance = event.clientY - gesture.startY;
    if (!gesture.scrolling && Math.abs(distance) > 6) {
      gesture.scrolling = true;
      // Clear the engine's pressed-button state without selecting an option.
      document.dispatchEvent(new PointerEvent("pointercancel", {
        pointerId: gesture.pointerId,
        pointerType: gesture.pointerType,
        isPrimary: true,
        cancelable: true
      }));
    }
    if (gesture.scrolling) {
      gesture.popup.scrollTop = gesture.startScroll - distance;
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener("pointerup", function (event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.scrolling) {
      event.preventDefault();
      event.stopPropagation();
    }
    gesture = null;
  }, true);

  window.addEventListener("pointercancel", function (event) {
    if (event.isTrusted && gesture && event.pointerId === gesture.pointerId) gesture = null;
  }, true);

  window.addEventListener("wheel", function (event) {
    var popup = scrollablePopup(event.target);
    if (!popup) return;
    var multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? popup.clientHeight : 1;
    popup.scrollTop += event.deltaY * multiplier;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, passive: false });
}());
