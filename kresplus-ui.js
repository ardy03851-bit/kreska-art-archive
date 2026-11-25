/* Small-screen popovers need their own scrolling: the archived drawing engine
   prevents native touch scrolling so gestures cannot accidentally paint. */
(function () {
  "use strict";

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
