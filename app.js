(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const MAX_DISTANCE = 1200;
  const production = Array.isArray(window.PRODUCTION_RESTAURANTS)
    ? window.PRODUCTION_RESTAURANTS
    : [];

  let budget = 'all';
  let distanceLimit = MAX_DISTANCE;
  const rejected = new Set();
  const activeMaps = [];

  const validPrice = (price) => Array.isArray(price)
    && price.length >= 2
    && Number.isFinite(price[0])
    && Number.isFinite(price[1]);

  const validCoords = (restaurant) => Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng);

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const cuisineLabels = [...new Set(
    production
      .map((restaurant) => restaurant.cuisine)
      .filter((cuisine) => cuisine && cuisine !== '餐厅')
  )].sort((a, b) => a.localeCompare(b, 'zh-CN'));

  function rand01() {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] / 0x100000000;
  }

  function weightOf(restaurant) {
    return Number.isFinite(restaurant.randomWeight) && restaurant.randomWeight > 0
      ? restaurant.randomWeight
      : 1;
  }

  function weightedPick(items) {
    if (!items.length) return null;
    let remaining = rand01() * items.reduce((sum, item) => sum + weightOf(item), 0);
    for (const item of items) {
      remaining -= weightOf(item);
      if (remaining < 0) return item;
    }
    return items[items.length - 1];
  }

  function weightedGroupIndex(groups) {
    const weights = groups.map(([, restaurants]) =>
      restaurants.reduce((sum, restaurant) => sum + weightOf(restaurant), 0));
    let remaining = rand01() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < weights.length; index += 1) {
      remaining -= weights[index];
      if (remaining < 0) return index;
    }
    return weights.length - 1;
  }

  function shuffle(items) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const other = Math.floor(rand01() * (index + 1));
      [output[index], output[other]] = [output[other], output[index]];
    }
    return output;
  }

  function pickThree(pool) {
    if (pool.length < 3) return [];

    const byCuisine = new Map();
    pool.forEach((restaurant) => {
      const cuisine = restaurant.cuisine || '餐厅';
      if (!byCuisine.has(cuisine)) byCuisine.set(cuisine, []);
      byCuisine.get(cuisine).push(restaurant);
    });

    const groups = [...byCuisine.entries()];
    const selected = [];

    while (selected.length < 3 && groups.length) {
      const index = weightedGroupIndex(groups);
      const [, restaurants] = groups.splice(index, 1)[0];
      const picked = weightedPick(restaurants);
      if (picked) selected.push(picked);
    }

    if (selected.length < 3) {
      const used = new Set(selected.map((restaurant) => restaurant.googlePlaceId));
      const remaining = pool.filter((restaurant) => !used.has(restaurant.googlePlaceId));
      while (selected.length < 3 && remaining.length) {
        const picked = weightedPick(remaining);
        if (!picked) break;
        selected.push(picked);
        remaining.splice(remaining.indexOf(picked), 1);
      }
    }

    return shuffle(selected);
  }

  function priceText(price) {
    if (!validPrice(price)) return null;
    if (price[0] === 0) return `¥${price[1].toLocaleString()}以下`;
    return `¥${price[0].toLocaleString()}–${price[1].toLocaleString()}`;
  }

  function budgetText(restaurant) {
    const lunch = priceText(restaurant.lunch);
    const dinner = priceText(restaurant.dinner);
    if (lunch && dinner && lunch !== dinner) return `午 ${lunch} · 晚 ${dinner}`;
    if (lunch) return `午 ${lunch}`;
    if (dinner) return `晚 ${dinner}`;
    return null;
  }

  function priceMatches(price, min, max = Infinity) {
    return validPrice(price) && price[0] <= max && price[1] >= min;
  }

  function budgetOK(restaurant) {
    if (budget === 'all') return true;
    const prices = [restaurant.lunch, restaurant.dinner];
    if (budget === 'under1000') return prices.some((price) => validPrice(price) && price[1] <= 999);
    if (budget === '1000') return prices.some((price) => priceMatches(price, 1000, 1999));
    if (budget === '2000') return prices.some((price) => priceMatches(price, 2000, 3999));
    if (budget === '4000') return prices.some((price) => priceMatches(price, 4000));
    return true;
  }

  function distanceText(restaurant) {
    const distance = restaurant.distanceMeters;
    return distance >= 1000
      ? `约${(distance / 1000).toFixed(1)}km`
      : `约${Math.round(distance / 10) * 10}m`;
  }

  function scheduleText(restaurant) {
    return restaurant.hoursReference || null;
  }

  function recommendationText(restaurant) {
    return Array.isArray(restaurant.recommendedDishes)
      ? restaurant.recommendedDishes.slice(0, 2).filter(Boolean).join(' · ')
      : '';
  }

  function mapsUrl(restaurant) {
    const query = encodeURIComponent(
      [restaurant.name, restaurant.address].filter(Boolean).join(', ') || restaurant.name
    );
    const placeId = encodeURIComponent(restaurant.googlePlaceId);
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${placeId}&utm_source=eat&utm_campaign=place_details_search`;
  }

  function awardBadge(restaurant) {
    if (!restaurant.hyakumeiten) return '';
    const award = [restaurant.hyakumeitenYear, restaurant.hyakumeitenCategory]
      .filter(Boolean)
      .join(' · ');
    return `<span class="pill hyakumeiten">百名店${award ? ` ${escapeHtml(award)}` : ''}</span>`;
  }

  function renderCard(restaurant, index) {
    const dishes = recommendationText(restaurant);
    const price = budgetText(restaurant);
    const schedule = scheduleText(restaurant);
    const map = validCoords(restaurant)
      ? `<div class="store-map" id="store-map-${index}" aria-label="${escapeHtml(restaurant.name)} 周边地图"></div>`
      : '';
    return `<article class="card result-card">
      <div class="card-main">
        <div class="result-heading">
          <span class="result-number">${index + 1}</span>
          <h2>${escapeHtml(restaurant.name)}</h2>
        </div>
        <div class="meta">
          ${awardBadge(restaurant)}
          <span class="pill">${escapeHtml(restaurant.cuisine)}</span>
          <span class="pill">${escapeHtml(distanceText(restaurant))}</span>
        </div>
        ${price ? `<p class="budget"><b>预算：</b>${escapeHtml(price)}</p>` : ''}
        ${dishes ? `<p class="dish"><b>推荐菜：</b>${escapeHtml(dishes)}</p>` : ''}
        ${schedule ? `<p class="hours"><b>营业参考：</b>${escapeHtml(schedule)}</p>` : ''}
        ${map}
        <a class="maps-link primary-link" href="${escapeHtml(mapsUrl(restaurant))}" target="_blank" rel="noopener">在 Google Maps 查看 ↗</a>
      </div>
    </article>`;
  }

  function compareCell(value, fallback = '—') {
    return value ? escapeHtml(value) : fallback;
  }

  function renderComparison(restaurants) {
    const rows = [
      ['菜系', ...restaurants.map((restaurant) => restaurant.cuisine || '餐厅')],
      ['距离', ...restaurants.map(distanceText)],
      ['预算', ...restaurants.map((restaurant) => budgetText(restaurant) || '—')],
      ['推荐菜', ...restaurants.map((restaurant) => recommendationText(restaurant) || '—')],
      ['营业参考', ...restaurants.map((restaurant) => scheduleText(restaurant) || '—')],
      ['百名店', ...restaurants.map((restaurant) => restaurant.hyakumeiten
        ? [restaurant.hyakumeitenYear, restaurant.hyakumeitenCategory].filter(Boolean).join(' · ') || '是'
        : '—')]
    ];

    return `<section class="panel compare-panel">
      <div class="section-heading">
        <div>
          <div class="eyebrow">COMPARE</div>
          <h2>三家快速对比</h2>
        </div>
      </div>
      <div class="compare-scroll">
        <table class="compare-table">
          <thead>
            <tr>
              <th>项目</th>
              ${restaurants.map((restaurant, index) => `<th><span class="compare-number">${index + 1}</span>${escapeHtml(restaurant.name)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(([label, ...values]) => `<tr><th>${escapeHtml(label)}</th>${values.map((value) => `<td>${compareCell(value)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
  }

  function renderOverviewMapShell(restaurants) {
    if (!restaurants.some(validCoords)) return '';
    return `<section class="panel overview-panel">
      <div class="section-heading">
        <div>
          <div class="eyebrow">OVERVIEW</div>
          <h2>三家位置总览</h2>
        </div>
        <span class="map-note">1–3 对应下方餐厅</span>
      </div>
      <div id="overview-map" class="overview-map" aria-label="三家餐厅位置总览地图"></div>
    </section>`;
  }

  function eligible(restaurant) {
    if (!restaurant.googlePlaceId || restaurant.googleStatus !== 'verified') return false;
    if (!Number.isFinite(restaurant.distanceMeters) || restaurant.distanceMeters > MAX_DISTANCE) return false;
    if (restaurant.distanceMeters > distanceLimit) return false;
    if (rejected.has(restaurant.cuisine)) return false;
    return budgetOK(restaurant);
  }

  function clearMaps() {
    while (activeMaps.length) {
      const map = activeMaps.pop();
      try {
        map.remove();
      } catch (_) {
        // Removed result containers are harmless.
      }
    }
  }

  function addTiles(map) {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
  }

  function numberIcon(number) {
    return L.divIcon({
      className: 'numbered-marker-wrap',
      html: `<span class="numbered-marker">${number}</span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18]
    });
  }

  function initResultMaps(restaurants) {
    if (!window.L) return;

    const mappable = restaurants
      .map((restaurant, index) => ({ restaurant, index }))
      .filter(({ restaurant }) => validCoords(restaurant));

    const overviewNode = $('#overview-map');
    if (overviewNode && mappable.length) {
      const overview = L.map(overviewNode, { scrollWheelZoom: false });
      addTiles(overview);
      const bounds = [];
      mappable.forEach(({ restaurant, index }) => {
        const point = [restaurant.lat, restaurant.lng];
        bounds.push(point);
        L.marker(point, { icon: numberIcon(index + 1) })
          .addTo(overview)
          .bindPopup(`<b>${escapeHtml(restaurant.name)}</b><br>${escapeHtml(restaurant.cuisine)} · ${escapeHtml(distanceText(restaurant))}`);
      });
      if (bounds.length === 1) overview.setView(bounds[0], 16);
      else overview.fitBounds(bounds, { padding: [34, 34], maxZoom: 16 });
      activeMaps.push(overview);
    }

    mappable.forEach(({ restaurant, index }) => {
      const node = $(`#store-map-${index}`);
      if (!node) return;
      const map = L.map(node, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false
      }).setView([restaurant.lat, restaurant.lng], 17);
      addTiles(map);
      L.marker([restaurant.lat, restaurant.lng], { icon: numberIcon(index + 1) }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
      activeMaps.push(map);
    });

    requestAnimationFrame(() => activeMaps.forEach((map) => map.invalidateSize(false)));
  }

  function renderCuisineFilters() {
    const box = $('#rejects');
    box.innerHTML = cuisineLabels
      .map((label) => `<button type="button" class="chip" data-tag="${escapeHtml(label)}">${escapeHtml(label)}</button>`)
      .join('');

    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tag]');
      if (!button) return;
      const cuisine = button.dataset.tag;
      if (rejected.has(cuisine)) rejected.delete(cuisine);
      else rejected.add(cuisine);
      button.classList.toggle('active', rejected.has(cuisine));
    });
  }

  function configureBudgetFilter() {
    const known = production.filter((restaurant) =>
      validPrice(restaurant.lunch) || validPrice(restaurant.dinner));
    if (known.length >= 3) return;
    const module = $('[data-filter-module="budget"]');
    if (module) module.hidden = true;
    budget = 'all';
  }

  function renderStats() {
    const stats = window.PRODUCTION_STATS || {};
    const total = stats.productionEntities ?? production.length;
    const cuisineKnown = stats.cuisineKnown
      ?? production.filter((restaurant) => restaurant.cuisine && restaurant.cuisine !== '餐厅').length;
    const budgetKnown = stats.budgetKnown
      ?? production.filter((restaurant) => validPrice(restaurant.lunch) || validPrice(restaurant.dinner)).length;
    const awards = stats.awards ?? production.filter((restaurant) => restaurant.hyakumeiten).length;
    $('#stats').innerHTML = `可推荐 <b>${total.toLocaleString()}</b> 家 · 菜系 <b>${cuisineKnown.toLocaleString()}</b> · 有预算 <b>${budgetKnown.toLocaleString()}</b> · 百名店 <b>${awards.toLocaleString()}</b>`;
  }

  function showMessage(message) {
    clearMaps();
    $('#results').innerHTML = `<div class="panel empty">${escapeHtml(message)}</div>`;
  }

  function generate() {
    const pool = production.filter(eligible);
    if (pool.length < 3) {
      showMessage(`当前条件下只有 ${pool.length} 家可选；请放宽筛选条件。`);
      return;
    }

    const result = pickThree(pool);
    clearMaps();
    $('#results').innerHTML = `
      <div class="result-summary">从 ${pool.length} 家符合条件的店里随机选出 3 家；优先避免重复菜系。</div>
      ${renderOverviewMapShell(result)}
      <div class="result-cards">${result.map(renderCard).join('')}</div>
      ${renderComparison(result)}
    `;
    initResultMaps(result);
  }

  $$('[data-budget]').forEach((button) => {
    button.onclick = () => {
      $$('[data-budget]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      budget = button.dataset.budget;
    };
  });

  $$('[data-distance]').forEach((button) => {
    button.onclick = () => {
      $$('[data-distance]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      distanceLimit = Number(button.dataset.distance);
    };
  });

  $('#generate').onclick = generate;

  if (production.length < 3) {
    showMessage('生产数据构建异常：可推荐餐厅不足 3 家。');
  }
  renderCuisineFilters();
  configureBudgetFilter();
  renderStats();
})();
