/* Казуал Хаб: правила «Васян ловит еду» — что, когда и как быстро падает. Лежат отдельно от игры (app.js), потому что по
   этим числам сервер проверяет счёт: SPAWN и POINTS — копия из functions/_lib/game-catch.js. tests/game-catch.test.mjs
   сверяет их и прогоняет pick много раз: очков по этим правилам не бывает больше, чем пропускает сервер (maxScore).
   Время — секунды игры без пауз. Мир — 180×120 пикселей спрайтов, скорости — в них же. */
(() => {
  // первая штука — на first, следующая — через max(gapMin, gap0 − gapK·t) после предыдущей; тортик, сосиска и рыбка —
  // [с какой секунды, не чаще чем раз в столько секунд]
  const SPAWN = { first: 0.8, gap0: 1.05, gapK: 0.0078, gapMin: 0.34, fish: [0, 1.2], sausage: [5, 3], cake: [12, 9] };
  const POINTS = { kibble: 1, fish: 3, sausage: 5, cake: 10 };
  // шанс выпасть, когда перерыв уже прошёл (иначе — корм)
  const CHANCE = { cake: 0.35, sausage: 0.3, fish: 0.35 };
  // огурец — вместо еды, с from-й секунды, всё чаще: доля p0 + k·t, не больше max
  const HAZ = { from: 4, p0: 0.1, k: 0.0025, max: 0.3 };
  // тучка с дождём — своим расписанием: первая на from-й секунде, дальше через every секунд (после late — через everyLate)
  const CLOUD = { from: 40, every: [9, 14], late: 90, everyLate: [7, 11] };
  // скорость падения, пикселей в секунду: от v0 растёт на k каждую секунду, до max; у капель — в drop раз быстрее
  const FALL = { v0: 44, k: 0.9, max: 120, drop: 1.5 };

  const gapAt = (t) => Math.max(SPAWN.gapMin, SPAWN.gap0 - SPAWN.gapK * t);
  const fallAt = (t) => Math.min(FALL.max, FALL.v0 + FALL.k * t);
  const hazardAt = (t) => (t < HAZ.from ? 0 : Math.min(HAZ.max, HAZ.p0 + HAZ.k * t));
  const cloudGap = (t, rnd) => { const [a, b] = t >= CLOUD.late ? CLOUD.everyLate : CLOUD.every; return a + (b - a) * rnd(); };
  // что появится на секунде s (время по цепочке gapAt, а не кадра). last — когда последний раз выпадали тортик, сосиска
  // и рыбка ({ cake, sausage, fish }), обновляется здесь; rnd — случай от 0 до 1
  function pick(s, last, rnd) {
    if (rnd() < hazardAt(s)) return 'cucumber';
    for (const k of ['cake', 'sausage', 'fish']) {
      const [from, gap] = SPAWN[k], l = last[k];
      if (s >= from && (l == null || s - l >= gap) && rnd() < CHANCE[k]) { last[k] = s; return k; }
    }
    return 'kibble';
  }
  window.CasualCatchRules = Object.freeze({ SPAWN, POINTS, CHANCE, HAZ, CLOUD, FALL, gapAt, fallAt, hazardAt, cloudGap, pick });
})();
