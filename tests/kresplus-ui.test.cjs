const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'kresplus-ui.js'), 'utf8');

function createHarness() {
  const listeners = new Map();
  const cancellations = [];
  const popup = { clientHeight: 200, scrollHeight: 400, scrollTop: 75 };

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
  return { popup, target, cancellations, emit, Element };
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
