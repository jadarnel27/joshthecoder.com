// Makes the "blog.sql" window buttons on the home page behave like macOS window controls:
// red closes the window, yellow minimizes it to a dock tile, green toggles full screen.
// The slot's data-state ("open", "closed", "minimized", "max") drives the CSS in console.css;
// this file only switches states and plays the transitions.
(function () {
  var slot = document.querySelector('.editor-slot');
  if (!slot || !slot.animate) return;

  var win = slot.querySelector('.editor');
  var scrim = slot.querySelector('.editor-scrim');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var busy = false;

  function play(el, keyframes, options) {
    var opts = { duration: reduceMotion.matches ? 0 : 240, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' };
    for (var k in options) opts[k] = options[k];
    return el.animate(keyframes, opts).finished;
  }

  function setState(state) { slot.dataset.state = state; }
  function focusIn(selector) { var el = slot.querySelector(selector); if (el) el.focus(); }

  // Run one transition at a time so double clicks can't leave the window half animated.
  function run(fn) {
    if (busy) return;
    busy = true;
    Promise.resolve(fn()).catch(function () {}).then(function () { busy = false; });
  }

  // ---- close / reopen ----
  function close() {
    return exitMax(true).then(function () {
      return play(win, [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.92)' }
      ]);
    }).then(function () {
      setState('closed');
      focusIn('[data-action="open"]');
      return play(slot.querySelector('.editor-closed'), [{ opacity: 0 }, { opacity: 1 }]);
    });
  }

  function reopen() {
    setState('open');
    focusIn('.editor__dot--close');
    return play(win, [
      { opacity: 0, transform: 'scale(0.92)' },
      { opacity: 1, transform: 'scale(1)' }
    ]);
  }

  // ---- minimize / restore (a rough "genie" into the dock tile) ----
  var genie = [
    { opacity: 1, transform: 'translateY(0) scale(1, 1)' },
    { opacity: 0.6, transform: 'translateY(30%) scale(0.5, 0.35)', offset: 0.6 },
    { opacity: 0, transform: 'translateY(45%) scale(0.12, 0.08)' }
  ];

  function minimize() {
    return exitMax(true).then(function () {
      win.style.transformOrigin = 'bottom center';
      return play(win, genie, { duration: reduceMotion.matches ? 0 : 380, easing: 'ease-in' });
    }).then(function () {
      win.style.transformOrigin = '';
      setState('minimized');
      focusIn('.editor-dock');
      return play(slot.querySelector('.editor-dock__icon'), [
        { transform: 'scale(0.4)' },
        { transform: 'scale(1.1)', offset: 0.7 },
        { transform: 'scale(1)' }
      ]);
    });
  }

  function restore() {
    setState('open');
    focusIn('.editor__dot--min');
    win.style.transformOrigin = 'bottom center';
    return play(win, genie.slice().reverse(), { duration: reduceMotion.matches ? 0 : 380, easing: 'ease-out' })
      .then(function () { win.style.transformOrigin = ''; });
  }

  // ---- full screen (FLIP: measure, switch state, animate from the old box to the new one) ----
  function flip(changeState) {
    var first = win.getBoundingClientRect();
    changeState();
    var last = win.getBoundingClientRect();
    win.style.transformOrigin = 'top left';
    return play(win, [
      {
        transform: 'translate(' + (first.left - last.left) + 'px, ' + (first.top - last.top) + 'px) ' +
                   'scale(' + first.width / last.width + ', ' + first.height / last.height + ')'
      },
      { transform: 'none' }
    ], { duration: reduceMotion.matches ? 0 : 320 }).then(function () { win.style.transformOrigin = ''; });
  }

  function enterMax() {
    // The window leaves the page flow while fixed, so hold its place in the hero.
    slot.style.minHeight = slot.offsetHeight + 'px';
    document.documentElement.style.overflow = 'hidden';
    var shown = flip(function () { setState('max'); });
    play(scrim, [{ opacity: 0 }, { opacity: 1 }]);
    return shown;
  }

  function exitMax(instant) {
    if (slot.dataset.state !== 'max') return Promise.resolve();
    function done() {
      slot.style.minHeight = '';
      document.documentElement.style.overflow = '';
    }
    if (instant) { setState('open'); done(); return Promise.resolve(); }
    return flip(function () { setState('open'); }).then(done);
  }

  // ---- wiring ----
  slot.addEventListener('click', function (e) {
    var button = e.target.closest('[data-action]');
    if (!button) return;
    var action = button.dataset.action;
    run(function () {
      if (action === 'close') return close();
      if (action === 'open') return reopen();
      if (action === 'minimize') return minimize();
      if (action === 'restore') return restore();
      if (action === 'maximize') return slot.dataset.state === 'max' ? exitMax(false) : enterMax();
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && slot.dataset.state === 'max') run(function () { return exitMax(false); });
  });
})();
