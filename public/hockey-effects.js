/* Несколько переиспользуемых SVG-элементов, без частиц и постоянного цикла. */
(function () {
  'use strict';
  const colors = {red: '#ee3047', blue: '#1989ed'};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const banner = document.getElementById('goalBanner');
  const goals = {red: document.getElementById('rightGoalGlow'), blue: document.getElementById('leftGoalGlow')};
  const waves = {};
  const animations = new Map();
  for (const team of ['red', 'blue']) {
    const keeper = document.querySelector('.goalkeeper[data-team="' + team + '"]');
    const center = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    center.setAttribute('transform', 'translate(0 3)');
    center.setAttribute('pointer-events', 'none');
    const wave = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    for (const [key, value] of Object.entries({r: 22, fill: 'none', stroke: colors[team], 'stroke-width': 3, opacity: 0})) {
      wave.setAttribute(key, value);
    }
    center.appendChild(wave);
    keeper.prepend(center);
    waves[team] = wave;
  }
  function play(node, frames, duration) {
    animations.get(node)?.cancel();
    const animation = node.animate(frames, {duration, easing: 'ease-out'});
    animations.set(node, animation);
    animation.onfinish = () => {
      if (animations.get(node) === animation) animations.delete(node);
    };
  }
  function clear() {
    animations.forEach(animation => animation.cancel());
    animations.clear();
  }
  window.HockeyEffects = {
    save(team) {
      play(waves[team], reducedMotion.matches ? [{opacity: .7}, {opacity: 0}] : [
        {opacity: .95, transform: 'scale(1)', strokeWidth: 4},
        {opacity: .65, transform: 'scale(1.65)', strokeWidth: 2, offset: .45},
        {opacity: 0, transform: 'scale(2.6)', strokeWidth: 1}
      ], 650);
    },
    goal(team) {
      clear();
      banner.style.color = goals[team].style.color = colors[team];
      play(goals[team], [{opacity: 0}, {opacity: .95, offset: .12}, {opacity: .8, offset: .7}, {opacity: 0}], 1600);
      play(banner, reducedMotion.matches ? [{opacity: 1}, {opacity: 1, offset: .8}, {opacity: 0}] : [
        {opacity: 0, transform: 'scale(.75)'},
        {opacity: 1, transform: 'scale(1.05)', offset: .16},
        {opacity: 1, transform: 'scale(1)', offset: .3},
        {opacity: 1, transform: 'scale(1)', offset: .78},
        {opacity: 0, transform: 'scale(1.05)'}
      ], 1400);
    },
    clear
  };
})();
