const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(rootDir, 'kresplus-ui.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(rootDir, 'kresplus.css'), 'utf8');

function createHarness() {
  const listeners = new Map();
  const cancellations = [];
  const popup = { clientHeight: 200, scrollHeight: 400, scrollTop: 75 };
  const canvases = [];

  class Element {
    constructor(container) { this.container = container; }
    closest(selector) {
      assert.equal(selector, '#guides_inner, #font_inner');
      return this.container;
    }
  }

  class PointerEvent {
    constructor(type, options) {
      Object.assign(this, options, { type, isTrusted: false });
    }
  }

  const window = {
    addEventListener(type, callback) { listeners.set(type, callback); }
  };
  const document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        width: 0,
        height: 0,
        lastImageData: null,
        getContext(kind) {
          assert.equal(kind, '2d');
          return {
            createImageData(w, h) {
              return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
            },
            putImageData(img) {
              canvas.lastImageData = img;
            }
          };
        }
      };
      canvases.push(canvas);
      return canvas;
    },
    dispatchEvent(event) {
      cancellations.push(event);
      const callback = listeners.get(event.type);
      if (callback) callback(event);
    }
  };

  vm.runInNewContext(source, { window, document, Element, PointerEvent });
  const target = new Element(popup);
  function emit(type, properties = {}) {
    const event = {
      target,
      pointerType: 'touch',
      pointerId: 7,
      isPrimary: true,
      isTrusted: true,
      clientY: 100,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
      ...properties
    };
    listeners.get(type)(event);
    return event;
  }
  return { window, popup, target, cancellations, canvases, emit, Element };
}

test('a tap remains available to the drawing app', () => {
  const h = createHarness();
  h.emit('pointerdown');
  const move = h.emit('pointermove', { clientY: 96 });
  const up = h.emit('pointerup', { clientY: 96 });
  assert.equal(h.popup.scrollTop, 75);
  assert.equal(h.cancellations.length, 0);
  assert.equal(move.stopped, undefined);
  assert.equal(up.stopped, undefined);
});

test('a touch drag scrolls without selecting a guide or font', () => {
  const h = createHarness();
  h.emit('pointerdown');
  const move = h.emit('pointermove', { clientY: 70 });
  assert.equal(h.popup.scrollTop, 105);
  assert.equal(h.cancellations.length, 1);
  assert.equal(h.cancellations[0].type, 'pointercancel');
  assert.equal(h.cancellations[0].pointerId, 7);
  assert.equal(move.prevented, true);
  assert.equal(move.stopped, true);

  h.emit('pointermove', { clientY: 60 });
  assert.equal(h.popup.scrollTop, 115);
  assert.equal(h.cancellations.length, 1);
  const up = h.emit('pointerup', { clientY: 60 });
  assert.equal(up.stopped, true);
  assert.equal(h.emit('pointermove', { clientY: 50 }).stopped, undefined);
});

test('a cancelled gesture and a non-overflowing panel do not intercept input', () => {
  const h = createHarness();
  h.emit('pointerdown');
  h.emit('pointercancel');
  assert.equal(h.emit('pointermove', { clientY: 40 }).stopped, undefined);

  h.popup.scrollHeight = h.popup.clientHeight;
  h.emit('pointerdown');
  assert.equal(h.emit('pointermove', { clientY: 40 }).stopped, undefined);
  assert.equal(h.cancellations.length, 0);
});

test('wheel scrolling is contained and respects line-sized deltas', () => {
  const h = createHarness();
  const wheel = h.emit('wheel', { deltaY: 2, deltaMode: 1 });
  assert.equal(h.popup.scrollTop, 107);
  assert.equal(wheel.prevented, true);
  assert.equal(wheel.stopped, true);

  const other = h.emit('wheel', { target: new h.Element(null), deltaY: 30, deltaMode: 0 });
  assert.equal(other.prevented, undefined);
});

test('the New badge rule uses a red background with white label text', () => {
  const match = cssSource.match(/body\.app\s+\.new::before\s*\{([^}]*)\}/);
  assert.ok(match, 'expected body.app .new::before rule in kresplus.css');
  assert.match(match[1], /background:\s*#d32f2f/i);
  assert.match(match[1], /color:\s*#fff(?:fff)?/i);
});

test('registers glossy acrylic brush under the Acrylic paint category with preview sprite', () => {
  const h = createHarness();
  const brush = h.window.brushes.kb_20250;
  assert.ok(brush, 'expected kb_20250 brush to be registered on window.brushes');
  assert.equal(brush.enabled, true);
  assert.equal(brush.category, 'acrylic paint');
  assert.equal(brush.name, 'glossy acrylic');
  assert.equal(brush.css, 'new');
  assert.equal(brush.type, 'direct');
  assert.equal(brush.gradient, true);
  assert.ok(brush.lerp > 0 && brush.lerp < 1, 'expected built-in stroke smoothing');
  assert.ok(brush.wet_paint_dilution > 0, 'expected wet paint blending');

  const previewBuf = fs.readFileSync(path.join(rootDir, 'preview', 'kb_20250.png'));
  assert.equal(previewBuf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(previewBuf.readUInt32BE(16), 500);
  assert.equal(previewBuf.readUInt32BE(20), 400);
});

test('glossy acrylic renders specular sheen in paint mode and clean tips in blend and erase modes', () => {
  const h = createHarness();
  const brush = h.window.brushes.kb_20250;
  const calls = [];
  h.window.brushes.common = {
    down(pt) { calls.push(['down', pt]); },
    move(pt) { calls.push(['move', pt]); },
    up(pt) { calls.push(['up', pt]); },
    __eWJtGt(pt, angle) { calls.push(['point', pt, angle]); }
  };

  const draws = [];
  const ctx = {
    globalAlpha: 0.58,
    drawImage(img, x, y, w, h) {
      draws.push({ img, x, y, w, h, alpha: this.globalAlpha });
    }
  };

  brush.color('#e53935');
  brush.down({ x: 50, y: 60 });
  brush.image(ctx, 80, { x: 50, y: 60, z: 1 });
  assert.equal(draws.length, 1);
  assert.deepEqual({ x: draws[0].x, y: draws[0].y, w: draws[0].w, h: draws[0].h, alpha: draws[0].alpha },
    { x: 10, y: 20, w: 80, h: 80, alpha: 0.58 });

  // Verify specular highlight is brighter than base red (#e53935 -> g=57, b=53) and outer corner is transparent
  const paintData = draws[0].img.lastImageData.data;
  const centerIdx = (64 * 128 + 64) * 4;
  const highlightIdx = (40 * 128 + 64) * 4; // ny ≈ -0.37 specular peak
  assert.equal(paintData[3], 0, 'corner pixel must be transparent');
  assert.equal(paintData[centerIdx + 3], 255, 'center pixel must be opaque');
  assert.ok(paintData[highlightIdx + 1] > paintData[centerIdx + 1] + 80,
    'specular ridge must have glossy highlight sheen above base pigment');

  // Single dot stamps at full alpha 1.0 and resets on end()
  brush.dot({ x: 30, y: 40 });
  brush.image(ctx, 40, { x: 30, y: 40, z: 1 });
  assert.equal(draws[1].alpha, 1);
  assert.equal(ctx.globalAlpha, 0.58);
  brush.end();
  brush.image(ctx, 40, { x: 30, y: 40, z: 1 });
  assert.equal(draws[2].alpha, 0.58);

  // Blend mode uses smooth unshaded pigment without artificial white highlight
  brush.blend = true;
  brush.color('#e53935');
  brush.image(ctx, 60, { x: 50, y: 60, z: 1 });
  const blendData = draws[3].img.lastImageData.data;
  assert.equal(blendData[highlightIdx + 1], blendData[centerIdx + 1]);
  brush.blend = false;

  // Erase mode uses clean white alpha mask
  brush.erase = true;
  brush.image(ctx, 60, { x: 50, y: 60, z: 1 });
  const eraseData = draws[4].img.lastImageData.data;
  assert.equal(eraseData[centerIdx], 255);
  assert.equal(eraseData[centerIdx + 3], 255);
  assert.equal(eraseData[3], 0);
  brush.erase = false;

  assert.equal(calls[0][0], 'down');
  assert.equal(calls[1][0], 'point');
  assert.equal(calls[1][2], -0.35);
  assert.equal(calls[2][0], 'up');
});
