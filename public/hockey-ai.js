/* Автономные команды и физика шайбы. Координаты совпадают с SVG катка. */
(function () {
  'use strict';
  const puckNode = document.getElementById('puck');
  const status = document.getElementById('aiStatus');
  const enabled = {red: false, blue: false};
  const skaters = Array.from(document.querySelectorAll('.player')).map(node => {
    const xy = node.getAttribute('transform').match(/[-\d.]+/g).map(Number);
    return {node, team: node.dataset.team, number: +node.dataset.number,
      x: xy[0], y: xy[1], homeX: xy[0], homeY: xy[1], cooldown: 0, held: 0};
  });
  const puck = {x: 600, y: 350, vx: 0, vy: 0, owner: null, lock: 0};
  const SHOT_SPEED_MIN = 1050;
  const SHOT_SPEED_MAX = 1200;
  const goalCages = [
    {x1: 70, x2: 100, y1: 300, y2: 400},
    {x1: 1100, x2: 1130, y1: 300, y2: 400}
  ];
  const goalFrameRects = [
    {x1: 68, x2: 74, y1: 297, y2: 403},
    {x1: 70, x2: 102, y1: 297, y2: 304},
    {x1: 70, x2: 102, y1: 396, y2: 403},
    {x1: 1126, x2: 1132, y1: 297, y2: 403},
    {x1: 1098, x2: 1130, y1: 297, y2: 304},
    {x1: 1098, x2: 1130, y1: 396, y2: 403}
  ];
  // Судья не входит в skaters: не сталкивается, не отбирает и не отбивает шайбу.
  const refereeNode = document.getElementById('referee');
  const referee = {x: 600, y: 110, vx: 0, vy: 0, phase: -Math.PI / 2, think: 0};
  let paused = false, faceoff = 0, previous = 0, accumulator = 0;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const direction = p => p.team === 'red' ? 1 : -1;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const active = p => !p.node.classList.contains('is-hidden');
  const manual = p => p.node === draggedPlayer;
  function announce(text) { if (status.textContent !== text) status.textContent = text; }
  function teamName(team) { return team === 'red' ? 'Метеор' : 'Вымпел'; }

  // Ограничение скруглённым контуром льда с запасом под размер фигуры.
  function contain(body, margin, bounce) {
    const minX = 30 + margin, maxX = 1170 - margin;
    const minY = 30 + margin, maxY = 670 - margin;
    if (body.x < minX || body.x > maxX) {
      body.x = clamp(body.x, minX, maxX);
      if (bounce) body.vx *= -0.78;
    }
    if (body.y < minY || body.y > maxY) {
      body.y = clamp(body.y, minY, maxY);
      if (bounce) body.vy *= -0.78;
    }
    const cx = clamp(body.x, 210, 990), cy = clamp(body.y, 210, 490);
    const dx = body.x - cx, dy = body.y - cy, len = Math.hypot(dx, dy);
    const radius = 180 - margin;
    if (len > radius) {
      const nx = dx / len, ny = dy / len;
      body.x = cx + nx * radius; body.y = cy + ny * radius;
      const dot = body.vx * nx + body.vy * ny;
      if (bounce && dot > 0) { body.vx -= 1.78 * dot * nx; body.vy -= 1.78 * dot * ny; }
    }
  }
  function segmentBoxEntry(x0, y0, x1, y1, box) {
    let enter = 0, exit = 1;
    for (const [start, delta, lo, hi] of [[x0, x1 - x0, box.x1, box.x2], [y0, y1 - y0, box.y1, box.y2]]) {
      if (Math.abs(delta) < 0.0001) {
        if (start < lo || start > hi) return null;
        continue;
      }
      let a = (lo - start) / delta, b = (hi - start) / delta;
      if (a > b) [a, b] = [b, a];
      enter = Math.max(enter, a); exit = Math.min(exit, b);
      if (enter > exit) return null;
    }
    return enter >= 0 && enter <= 1 ? enter : null;
  }
  function keepOutOfGoalCages(body, radius, oldX, oldY) {
    for (const cage of goalCages) {
      const box = {x1: cage.x1 - radius, x2: cage.x2 + radius,
        y1: cage.y1 - radius, y2: cage.y2 + radius};
      const targetInside = body.x > box.x1 && body.x < box.x2 && body.y > box.y1 && body.y < box.y2;
      const oldStrictlyOutside = Number.isFinite(oldX) &&
        (oldX < box.x1 || oldX > box.x2 || oldY < box.y1 || oldY > box.y2);
      if (oldStrictlyOutside) {
        const entry = segmentBoxEntry(oldX, oldY, body.x, body.y, box);
        if (entry !== null) {
          const safe = Math.max(0, entry - 0.002);
          body.x = oldX + (body.x - oldX) * safe;
          body.y = oldY + (body.y - oldY) * safe;
          continue;
        }
        if (!targetInside) continue;
      }
      if (!targetInside) continue;
      const exits = [
        {distance: body.x - box.x1, axis: 'x', value: box.x1},
        {distance: box.x2 - body.x, axis: 'x', value: box.x2},
        {distance: body.y - box.y1, axis: 'y', value: box.y1},
        {distance: box.y2 - body.y, axis: 'y', value: box.y2}
      ].sort((a, b) => a.distance - b.distance);
      body[exits[0].axis] = exits[0].value;
    }
  }
  function collidePuckWithGoalFrames() {
    const radius = 8;
    for (const box of goalFrameRects) {
      const nearestX = clamp(puck.x, box.x1, box.x2);
      const nearestY = clamp(puck.y, box.y1, box.y2);
      let dx = puck.x - nearestX, dy = puck.y - nearestY;
      let length = Math.hypot(dx, dy);
      if (length >= radius) continue;
      let nx, ny;
      if (length > 0.001) {
        nx = dx / length; ny = dy / length;
      } else {
        const exits = [
          {distance: puck.x - box.x1, nx: -1, ny: 0, x: box.x1 - radius, y: puck.y},
          {distance: box.x2 - puck.x, nx: 1, ny: 0, x: box.x2 + radius, y: puck.y},
          {distance: puck.y - box.y1, nx: 0, ny: -1, x: puck.x, y: box.y1 - radius},
          {distance: box.y2 - puck.y, nx: 0, ny: 1, x: puck.x, y: box.y2 + radius}
        ].sort((a, b) => a.distance - b.distance);
        nx = exits[0].nx; ny = exits[0].ny;
        puck.x = exits[0].x; puck.y = exits[0].y; length = radius;
      }
      if (length < radius) {
        puck.x = nearestX + nx * radius;
        puck.y = nearestY + ny * radius;
      }
      const impact = puck.vx * nx + puck.vy * ny;
      if (impact < 0) {
        puck.vx -= 1.72 * impact * nx;
        puck.vy -= 1.72 * impact * ny;
      }
    }
  }
  function move(p, x, y, speed, dt) {
    if (manual(p)) return;
    const oldX = p.x, oldY = p.y;
    const dx = x - p.x, dy = y - p.y, len = Math.hypot(dx, dy);
    const step = Math.min(len, speed * dt);
    if (len > 0) { p.x += dx / len * step; p.y += dy / len * step; }
    contain(p, 25, false);
    keepOutOfGoalCages(p, 25, oldX, oldY);
  }
  function release(p, x, y, speed, label) {
    const dx = x - puck.x, dy = y - puck.y, len = Math.hypot(dx, dy) || 1;
    puck.owner = null; puck.vx = dx / len * speed; puck.vy = dy / len * speed;
    puck.lock = 0.09; p.cooldown = 0.55; p.held = 0;
    announce(teamName(p.team) + ': ' + label);
  }
  function take(p) {
    puck.owner = p; puck.vx = puck.vy = 0; p.held = 0;
    p.routeY = p.y < 315 ? 105 : p.y > 385 ? 595 : (Math.random() < 0.5 ? 105 : 595);
    p.attackPlan = Math.random() < 0.7 ? 'cycle' : 'direct';
  }
  function segmentClearance(a, b, opponents) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    let clearance = 180;
    for (const o of opponents) {
      const t = clamp(((o.x - a.x) * dx + (o.y - a.y) * dy) / lengthSquared, 0, 1);
      clearance = Math.min(clearance, Math.hypot(o.x - a.x - t * dx, o.y - a.y - t * dy));
    }
    return clearance;
  }
  function supportTarget(p, owner, squad, opponents, goalX, dir, dt) {
    p.supportThink = (p.supportThink || 0) - dt;
    if (p.supportOwner === owner && p.supportThink > 0 && Number.isFinite(p.supportX)) {
      return {x: p.supportX, y: p.supportY};
    }

    // Нападающие открываются на разных глубинах у ворот, защитники — эшелоном около синей линии.
    const zones = {
      1: {depths: [115, 190, 270], ys: [105, 155, 215]},
      2: {depths: [145, 230, 315], ys: [275, 350, 425]},
      3: {depths: [115, 190, 270], ys: [485, 545, 595]},
      4: {depths: [280, 340, 400], ys: [190, 250, 310]},
      5: {depths: [280, 340, 400], ys: [390, 460, 520]}
    };
    const zone = zones[p.number] || zones[2];
    let best = null, bestScore = -Infinity;
    for (const depth of zone.depths) {
      for (const y of zone.ys) {
        const candidate = {x: goalX - dir * depth, y};
        const nearestOpponent = opponents.length
          ? Math.min(...opponents.map(o => distance(candidate, o))) : 180;
        const otherMates = squad.filter(m => m !== p && m !== owner);
        const nearestMate = otherMates.length ? Math.min(...otherMates.map(m => {
          const target = m.supportOwner === owner && Number.isFinite(m.supportX)
            ? {x: m.supportX, y: m.supportY} : m;
          return distance(candidate, target);
        })) : 180;
        const verticalCrowding = otherMates.reduce((penalty, m) => {
          const mx = m.supportOwner === owner && Number.isFinite(m.supportX) ? m.supportX : m.x;
          return penalty + Math.max(0, 70 - Math.abs(candidate.x - mx));
        }, 0);
        const passingLane = segmentClearance(owner, candidate, opponents);
        const score = Math.min(nearestOpponent, 190) * 1.35
          + Math.min(nearestMate, 180) * 0.55
          + Math.min(passingLane, 120) * 0.9
          - distance(p, candidate) * 0.12
          - verticalCrowding * 0.9
          + Math.random() * 8;
        if (score > bestScore) { bestScore = score; best = candidate; }
      }
    }
    p.supportOwner = owner;
    p.supportX = best.x;
    p.supportY = best.y;
    p.supportThink = 0.35 + Math.random() * 0.25;
    return best;
  }
  function resetPositions() {
    puck.x = 600; puck.y = 350; puck.vx = puck.vy = 0; puck.owner = null; puck.lock = 0;
    skaters.forEach(p => {
      if (!manual(p)) { p.x = p.homeX; p.y = p.homeY; }
      p.cooldown = 0; p.held = 0; p.supportOwner = null; p.supportThink = 0;
    });
  }
  function paint() {
    skaters.forEach(p => {
      if (!manual(p)) p.node.setAttribute('transform', 'translate(' + p.x.toFixed(2) + ', ' + p.y.toFixed(2) + ')');
    });
    puckNode.setAttribute('cx', puck.x); puckNode.setAttribute('cy', puck.y);
  }
  function syncDragged() {
    skaters.forEach(p => {
      // Читаем и ручные изменения между кадрами, в том числе во время паузы.
      const xy = p.node.getAttribute('transform').match(/[-\d.]+/g).map(Number);
      p.x = xy[0]; p.y = xy[1];
    });
  }
  function step(dt) {
    if (faceoff > 0) { faceoff -= dt; return; }
    const live = skaters.filter(active);
    if (puck.owner && (!active(puck.owner) || manual(puck.owner))) puck.owner = null;
    puck.lock = Math.max(0, puck.lock - dt);
    live.forEach(p => { p.cooldown = Math.max(0, p.cooldown - dt); });
    for (const team of ['red', 'blue']) {
      if (!enabled[team]) continue;
      const squad = live.filter(p => p.team === team && p.number !== 0 && !manual(p));
      const opponent = live.filter(p => p.team !== team);
      const chasers = squad.slice().sort((a, b) => distance(a, puck) - distance(b, puck));
      const dir = team === 'red' ? 1 : -1;
      const goalX = team === 'red' ? 1100 : 100;
      const blueLineX = team === 'red' ? 760 : 440;
      const behindNetX = goalX + dir * 35;
      for (const p of squad) {
        if (puck.owner === p) {
          p.held += dt;
          const pressure = opponent.filter(o => o.number && distance(o, p) < 110).length;
          const mates = squad.filter(m => m !== p && distance(m, p) > 85 && distance(m, p) < 520);
          // Оцениваем продвижение, свободу получателя и перекрытие линии паса.
          const passScore = m => {
            let score = (m.x - p.x) * dir * 0.38 + Math.abs(m.y - p.y) * 0.12;
            for (const o of opponent) {
              if (distance(m, o) < 80) score -= 90;
              const dx = m.x - p.x, dy = m.y - p.y;
              const t = clamp(((o.x - p.x) * dx + (o.y - p.y) * dy) / (dx * dx + dy * dy), 0, 1);
              if (t > 0.12 && t < 0.9 && Math.hypot(o.x - p.x - t * dx, o.y - p.y - t * dy) < 28) score -= 120;
            }
            return score;
          };
          mates.sort((a, b) => passScore(b) - passScore(a));
          const behindNet = Math.abs(p.x - behindNetX) < 38 && Math.abs(p.y - 350) > 70;
          const pointMen = squad.filter(m => m !== p && m.number >= 4);
          pointMen.sort((a, b) => {
            const spaceA = Math.min(...opponent.map(o => distance(a, o)));
            const spaceB = Math.min(...opponent.map(o => distance(b, o)));
            return spaceB - spaceA;
          });
          const blueLineShot = p.number >= 4 && Math.abs(p.x - blueLineX) < 105;
          const cycling = p.number <= 3 && p.attackPlan === 'cycle';
          if (behindNet && p.held > 0.3 && pointMen.length) {
            release(p, pointMen[0].x, pointMen[0].y + 8, 560,
              'пас из-за ворот на синюю линию игроку ' + pointMen[0].number);
          } else if (blueLineShot && p.held > 0.38) {
            const goalie = opponent.find(o => o.number === 0);
            const aim = goalie && goalie.y + 8 < 350 ? 383 : 317;
            const shotSpeed = SHOT_SPEED_MIN + Math.random() * (SHOT_SPEED_MAX - SHOT_SPEED_MIN);
            release(p, goalX, aim + (Math.random() - 0.5) * 18, shotSpeed, 'бросок с синей линии!');
          } else if (!cycling && p.held > 0.72 && Math.abs(goalX - p.x) < 330 && Math.abs(p.y - 350) < 175) {
            const goalie = opponent.find(o => o.number === 0);
            const aim = goalie && goalie.y + 8 < 350 ? 383 : 317;
            const shotSpeed = SHOT_SPEED_MIN + Math.random() * (SHOT_SPEED_MAX - SHOT_SPEED_MIN);
            release(p, goalX, aim + (Math.random() - 0.5) * 18, shotSpeed, 'бросок по воротам!');
          } else if (p.held > 0.48 && mates.length && passScore(mates[0]) > -90 && (pressure || (!cycling && p.held > 1.15))) {
            release(p, mates[0].x, mates[0].y + 8, 485, 'пас игроку ' + mates[0].number);
          } else if (cycling) {
            const inAttackZone = Math.abs(goalX - p.x) < 340;
            const behindY = p.routeY < 350 ? 245 : 455;
            const advanceX = clamp(p.x + dir * 180, 80, 1120);
            move(p, inAttackZone ? behindNetX : advanceX,
              inAttackZone ? behindY : p.routeY, 138, dt);
          } else {
            move(p, goalX - dir * 135, 350 + Math.sin(p.number * 2) * 65, 124, dt);
          }
        } else if (!puck.owner || puck.owner.team !== team) {
          if (p === chasers[0]) {
            move(p, puck.x + puck.vx * 0.12, puck.y + puck.vy * 0.12 - 8, 154, dt);
          } else {
            const homeGoal = team === 'red' ? 100 : 1100;
            const lanes = {1: 135, 2: 315, 3: 565, 4: 225, 5: 470};
            let targetX, targetY;
            if (!puck.owner) {
              // За свободной шайбой идёт один игрок, остальные образуют диагональ поддержки.
              const depths = {1: 85, 2: 150, 3: 220, 4: 295, 5: 365};
              targetX = puck.x - dir * depths[p.number];
              const homeLimit = homeGoal + dir * (80 + p.number * 28);
              targetX = dir > 0 ? Math.max(targetX, homeLimit) : Math.min(targetX, homeLimit);
              targetY = lanes[p.number] + (puck.y - 350) * 0.08;
            } else {
              // Зонная оборона зависит только от владельца шайбы и не зеркалит соперников попарно.
              const depthShare = {1: 0.62, 2: 0.49, 3: 0.57, 4: 0.28, 5: 0.36};
              targetX = homeGoal + (puck.owner.x - homeGoal) * depthShare[p.number]
                + dir * (p.number - 3) * 13;
              targetY = lanes[p.number] + (puck.owner.y - 350) * 0.14;
            }
            move(p, clamp(targetX, 150, 1050), clamp(targetY, 105, 595), 118, dt);
          }
        } else {
          const owner = puck.owner;
          const target = supportTarget(p, owner, squad, opponent.filter(o => o.number), goalX, dir, dt);
          move(p, target.x, target.y, p.number <= 3 ? 138 : 132, dt);
        }
      }
      const keeper = live.find(p => p.team === team && p.number === 0 && !manual(p));
      if (keeper) {
        const gx = team === 'red' ? 125 : 1075;
        const travel = Math.abs(puck.vx) > 1 ? (gx - puck.x) / puck.vx : -1;
        const aimY = travel > 0 && travel < 0.75 ? puck.y + puck.vy * travel : 350 + (puck.y - 350) * 0.16;
        keeper.reaction = (keeper.reaction || 0) - dt;
        if (keeper.reaction <= 0) {
          keeper.targetY = clamp(aimY - 8 + (Math.random() - 0.5) * 10, 315, 355);
          keeper.reaction = 0.18;
        }
        move(keeper, gx, keeper.targetY, 115, dt);
        if (puck.owner === keeper) {
          keeper.held += dt;
          if (keeper.held > 0.45) {
            const mate = squad.slice().sort((a, b) => distance(a, keeper) - distance(b, keeper))[0];
            release(keeper, mate ? mate.x : gx + dir * 400, mate ? mate.y : 260, 420, 'вратарь вводит шайбу');
          }
        }
      }
    }
    // Партнёры держат дистанцию заметно строже, чем соперники в единоборстве.
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        if (a.team === b.team && Math.abs(dx) < 52 && Math.abs(dy) > 38 && Math.abs(dy) < 250) {
          const side = Math.abs(dx) > 0.5 ? Math.sign(dx) : ((a.number + b.number) % 2 ? 1 : -1);
          const lateral = Math.min((52 - Math.abs(dx)) * 0.5, 82 * dt);
          if (a.number && enabled[a.team] && !manual(a)) { a.x -= side * lateral; contain(a, 25, false); keepOutOfGoalCages(a, 25); }
          if (b.number && enabled[b.team] && !manual(b)) { b.x += side * lateral; contain(b, 25, false); keepOutOfGoalCages(b, 25); }
        }
        const gap = a.team === b.team ? 62 : 34;
        if (len >= gap) continue;
        const push = Math.min((gap - len) * 0.5, 95 * dt);
        const nx = len > 0.01 ? dx / len : 1, ny = len > 0.01 ? dy / len : 0;
        if (a.number && enabled[a.team] && !manual(a)) { a.x -= nx * push; a.y -= ny * push; contain(a, 25, false); keepOutOfGoalCages(a, 25); }
        if (b.number && enabled[b.team] && !manual(b)) { b.x += nx * push; b.y += ny * push; contain(b, 25, false); keepOutOfGoalCages(b, 25); }
      }
    }
    if (puck.owner) {
      const owner = puck.owner;
      puck.x = owner.x + direction(owner) * 18; puck.y = owner.y + 8;
      for (const p of live) {
        if (p.team === owner.team || !enabled[p.team] || manual(p) || p.cooldown > 0) continue;
        if (distance(p, puck) < 31 && Math.random() < dt * 2.6) {
          owner.cooldown = 0.65; take(p); announce(teamName(p.team) + ': отбор шайбы'); break;
        }
      }
    } else {
      const oldX = puck.x, oldY = puck.y;
      puck.x += puck.vx * dt; puck.y += puck.vy * dt;
      puck.vx *= Math.exp(-0.34 * dt); puck.vy *= Math.exp(-0.34 * dt);
      for (const p of live) {
        if (manual(p) || p.cooldown > 0 || puck.lock > 0) continue;
        const speed = Math.hypot(puck.vx, puck.vy);
        const hit = Math.hypot(puck.x - p.x, puck.y - (p.y + 8));
        if (p.number === 0 && hit < 25) {
          if (speed < 160 && enabled[p.team]) take(p);
          else {
            puck.vx = direction(p) * Math.max(200, speed * 0.65);
            puck.vy = (puck.y - p.y - 8) * 13 + (Math.random() - 0.5) * 160;
            puck.x = p.x + direction(p) * 28; p.cooldown = 0.16;
          }
          window.HockeyEffects?.save(p.team);
          announce(teamName(p.team) + ': вратарь отбил шайбу!'); break;
        }
        if (p.number && enabled[p.team] && hit < 24 && speed < 520) { take(p); break; }
      }
      if (!puck.owner) {
        for (const goal of [{x: 100, team: 'blue', crossed: oldX >= 100 && puck.x < 100},
                            {x: 1100, team: 'red', crossed: oldX <= 1100 && puck.x > 1100}]) {
          if (!goal.crossed) continue;
          const crossY = oldY + (puck.y - oldY) * (goal.x - oldX) / (puck.x - oldX);
          if (crossY > 309 && crossY < 391) {
            changeScore(goal.team, 1); announce('Гол! ' + teamName(goal.team) + ' забили. Вбрасывание в центре.');
            resetPositions(); faceoff = 1.5; return;
          }
        }
        collidePuckWithGoalFrames();
        contain(puck, 8, true);
      }
    }
  }
  function frame(now) {
    syncDragged();
    const elapsed = previous ? Math.min((now - previous) / 1000, 0.08) : 0;
    previous = now;
    if (!paused && (enabled.red || enabled.blue)) {
      accumulator += elapsed;
      while (accumulator >= 1 / 120) { step(1 / 120); accumulator -= 1 / 120; }
    } else accumulator = 0;
    if (!paused) updateReferee(elapsed);
    paint(); requestAnimationFrame(frame);
  }
  function updateReferee(dt) {
    if (!refereeNode || !dt) return;
    referee.phase += dt * 0.13;
    referee.think -= dt;
    if (referee.think <= 0) {
      referee.think = 0.05;
      const target = {x: 600 + 420 * Math.cos(referee.phase), y: 350 + 240 * Math.sin(referee.phase)};
      const hazards = skaters.filter(active).map(p => ({x: p.x, y: p.y, radius: 120, vx: 0, vy: 0}));
      hazards.push({x: puck.x, y: puck.y, radius: 175, vx: puck.vx, vy: puck.vy});
      const danger = hazards.some(h => distance(referee, h) < h.radius + 35);
      const speed = danger ? 240 : 85;
      let bestScore = Infinity, bestX = 0, bestY = 0;
      // Короткий прогноз пути шайбы и оценка свободных направлений, 20 раз в секунду.
      for (let i = 0; i <= 24; i++) {
        const angle = i * Math.PI / 12;
        const vx = i === 24 ? 0 : Math.cos(angle) * speed;
        const vy = i === 24 ? 0 : Math.sin(angle) * speed;
        let score = 0;
        for (const t of [0.15, 0.4, 0.7]) {
          const point = {x: referee.x + vx * t, y: referee.y + vy * t};
          const rawX = point.x, rawY = point.y;
          contain(point, 38, false);
          score += Math.hypot(rawX - point.x, rawY - point.y) * 40;
          for (const h of hazards) {
            const gap = Math.hypot(point.x - h.x - h.vx * t, point.y - h.y - h.vy * t);
            score += Math.max(0, h.radius - gap) ** 2 * 3;
          }
          if (t === 0.7) score += distance(point, target);
        }
        score += Math.hypot(vx - referee.vx, vy - referee.vy) * 0.12;
        if (score < bestScore) { bestScore = score; bestX = vx; bestY = vy; }
      }
      referee.vx = bestX; referee.vy = bestY;
    }
    referee.x += referee.vx * dt; referee.y += referee.vy * dt;
    contain(referee, 38, false);
    refereeNode.setAttribute('transform', 'translate(' + referee.x.toFixed(2) + ', ' + referee.y.toFixed(2) + ')');
  }
  window.HockeyAI = {
    constrainPlayer(x, y, oldX, oldY) {
      const body = {x, y};
      contain(body, 25, false);
      keepOutOfGoalCages(body, 25, oldX, oldY);
      return body;
    },
    start() {
      enabled.red = true; enabled.blue = true; paused = false; faceoff = 0.7;
      for (const team of ['red', 'blue']) {
        const button = document.getElementById(team + 'AI');
        button.setAttribute('aria-pressed', 'true');
        button.textContent = 'ИИ: включён';
      }
      const button = document.getElementById('pauseAI');
      button.textContent = 'Пауза игры';
      button.setAttribute('aria-pressed', 'false');
      button.onclick = () => window.HockeyAI.pause();
      announce('Матч начался: Метеор против Вымпела');
    },
    toggle(team) {
      enabled[team] = !enabled[team];
      const button = document.getElementById(team + 'AI');
      button.setAttribute('aria-pressed', String(enabled[team]));
      button.textContent = enabled[team] ? 'ИИ: включён' : 'ИИ: выключен';
      if (!enabled[team] && puck.owner && puck.owner.team === team) puck.owner = null;
      announce(teamName(team) + ': ИИ ' + (enabled[team] ? 'включён' : 'выключен'));
    },
    pause() {
      paused = !paused;
      document.getElementById('pauseAI').textContent = paused ? 'Продолжить игру' : 'Пауза игры';
      document.getElementById('pauseAI').setAttribute('aria-pressed', String(paused));
      document.getElementById('pauseAI').onclick = () => window.HockeyAI.pause();
      announce(paused ? 'Игра на паузе' : 'Игра продолжается');
    },
    reset() { resetPositions(); faceoff = 0.7; paint(); announce('Игроки на стартовых позициях. Шайба в центре.'); }
  };
  document.addEventListener('visibilitychange', () => { previous = 0; accumulator = 0; });
  requestAnimationFrame(frame);
})();
