(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const MAX_DISTANCE = 1200;
  const NII_REFERENCE = Object.freeze({
    lat: 35.6924611,
    lng: 139.7581028
  });
  const canonical = Array.isArray(window.PRODUCTION_RESTAURANTS)
    ? window.PRODUCTION_RESTAURANTS
    : [];
  const inventoryRuntime = Array.isArray(window.GOOGLE_INVENTORY_RESTAURANTS)
    ? window.GOOGLE_INVENTORY_RESTAURANTS
    : [];
  const production = inventoryRuntime.length ? inventoryRuntime : canonical;

  let budget = 'all';
  let distanceLimit = MAX_DISTANCE;
  const rejected = new Set();
  const activeMaps = [];

  const validPrice = (price) => Array.isArray(price)
    && price.length >= 2
    && Number.isFinite(price[0])
    && Number.isFinite(price[1]);

  const validCoords = (restaurant) => Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng);
  const hasGooglePlaceId = (restaurant) => typeof restaurant.googlePlaceId === 'string'
    && restaurant.googlePlaceId.trim().length > 0;
  const restaurantKey = (restaurant) => restaurant.googlePlaceId || restaurant.id;

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  // Display/filter aliases only. Keep all source restaurant objects unchanged.
  const CUISINE_ALIASES = Object.freeze({
    '中華': '中华', '中華料理': '中华',
    '韓国料理': '韩国菜', '台湾料理': '台湾菜',
    '冲绳料理': '冲绳菜', '沖縄料理': '冲绳菜',
    'ラーメン': '拉面', '乌冬面': '乌冬', 'うどん': '乌冬',
    '烧肉': '烤肉', '焼肉': '烤肉', '焼肉・ホルモン': '烤肉',
    '烧鸟': '烤鸡', '焼き鳥': '烤鸡',
    '和食': '日式', '洋食': '西式', '西餐': '西式',
    'バー・カクテル': '酒吧',
    'ダイニングバー・バル': '餐酒馆',
    'カフェ・スイーツ': '咖啡·甜品',
    'イタリアン・フレンチ': '意大利·法国菜',
    'アジア・エスニック料理': '亚洲料理',
    'お好み焼き・もんじゃ': '御好烧·文字烧',
    '創作料理': '创意料理', 'カラオケ・パーティ': '聚会餐饮'
  });
  const GENERIC_CUISINES = new Set(['', '餐厅', 'restaurant', 'その他グルメ']);
  function displayCuisine(restaurant) {
    const raw = String(restaurant.cuisine || '').normalize('NFKC').trim();
    if (GENERIC_CUISINES.has(raw.toLowerCase())) return '';
    return CUISINE_ALIASES[raw] || raw;
  }
  const cuisineCounts = new Map();
  production.forEach((restaurant) => {
    const label = displayCuisine(restaurant);
    if (label) cuisineCounts.set(label, (cuisineCounts.get(label) || 0) + 1);
  });
  const cuisineLabels = [...cuisineCounts.keys()].sort((a, b) =>
    cuisineCounts.get(b) - cuisineCounts.get(a) || a.localeCompare(b, 'zh-CN'));
  const PRIMARY_CUISINE_COUNT = 12;
  const secondaryCuisines = cuisineLabels.slice(PRIMARY_CUISINE_COUNT);

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
      const cuisine = displayCuisine(restaurant) || '未分类';
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
      const used = new Set(selected.map(restaurantKey));
      const remaining = pool.filter((restaurant) => !used.has(restaurantKey(restaurant)));
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
    if (!Number.isFinite(distance)) {
      return restaurant.inventoryWithinRadius ? '1.2km内' : '距离待补';
    }
    return distance >= 1000
      ? `约${(distance / 1000).toFixed(1)}km`
      : `约${Math.round(distance / 10) * 10}m`;
  }

  function scheduleText(restaurant) {
    return restaurant.hoursReference || null;
  }

  function featuredDishText(dish) {
    if (typeof dish === 'string') return dish;
    if (!dish || typeof dish !== 'object') return '';
    const name = dish.nameZh || dish.nameJa || '';
    if (!name) return '';
    return dish.priceText ? `${name} ${dish.priceText}` : name;
  }

  function dishInfo(restaurant) {
    if (Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length) {
      return {
        label: '推荐菜',
        text: restaurant.recommendedDishes.slice(0, 2).filter(Boolean).join(' · ')
      };
    }
    if (Array.isArray(restaurant.featuredDishes) && restaurant.featuredDishes.length) {
      return {
        label: '特色菜',
        text: restaurant.featuredDishes.slice(0, 2).map(featuredDishText).filter(Boolean).join(' · ')
      };
    }
    return { label: '', text: '' };
  }

  function recommendationText(restaurant) {
    return dishInfo(restaurant).text;
  }

  function mapsUrl(restaurant) {
    const query = encodeURIComponent(
      [restaurant.name, restaurant.address].filter(Boolean).join(', ') || restaurant.name
    );
    const common = `https://www.google.com/maps/search/?api=1&query=${query}&utm_source=eat&utm_campaign=place_details_search`;
    if (!hasGooglePlaceId(restaurant)) return common;
    const placeId = encodeURIComponent(restaurant.googlePlaceId);
    return `${common}&query_place_id=${placeId}`;
  }

  function awardBadge(restaurant) {
    if (!restaurant.hyakumeiten) return '';
    const award = [restaurant.hyakumeitenYear, restaurant.hyakumeitenCategory]
      .filter(Boolean)
      .join(' · ');
    return `<span class="pill hyakumeiten">百名店${award ? ` ${escapeHtml(award)}` : ''}</span>`;
  }

  function renderStoreMap(restaurant, index) {
    if (!validCoords(restaurant)) return '';
    return `<div class="store-map" id="store-map-${index}" aria-label="${escapeHtml(restaurant.name)} 周边地图"></div>`;
  }

  function renderCard(restaurant, index) {
    const dish = dishInfo(restaurant);
    const price = budgetText(restaurant);
    const schedule = scheduleText(restaurant);
    const map = renderStoreMap(restaurant, index);
    const cuisine = displayCuisine(restaurant);
    return `<article class="card result-card">
      <div class="card-main">
        <div class="result-heading">
          <span class="result-number">${index + 1}</span>
          <h2>${escapeHtml(restaurant.name)}</h2>
        </div>
        <div class="meta">
          ${awardBadge(restaurant)}
          ${cuisine ? `<span class="pill">${escapeHtml(cuisine)}</span>` : ''}
          <span class="pill">${escapeHtml(distanceText(restaurant))}</span>
        </div>
        ${price ? `<p class="budget"><b>预算：</b>${escapeHtml(price)}</p>` : ''}
        ${dish.text ? `<p class="dish"><b>${escapeHtml(dish.label)}：</b>${escapeHtml(dish.text)}</p>` : ''}
        ${schedule ? `<p class="hours"><b>营业时间：</b>${escapeHtml(schedule)}</p>` : ''}
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
      ['菜系', ...restaurants.map(displayCuisine)],
      ['距离', ...restaurants.map(distanceText)],
      ['预算', ...restaurants.map(budgetText)],
      ['推荐/特色菜', ...restaurants.map(recommendationText)],
      ['营业时间', ...restaurants.map(scheduleText)],
      ['百名店', ...restaurants.map((restaurant) => restaurant.hyakumeiten
        ? [restaurant.hyakumeitenYear, restaurant.hyakumeitenCategory].filter(Boolean).join(' · ') || '是'
        : '')]
    ].filter(([, ...values]) => values.some((value) => value != null && String(value).trim()));

    return `<details class="panel compare-panel">
      <summary>展开三家对比</summary>
      <div class="compare-scroll">
        <table class="compare-table">
          <caption class="sr-only">三家餐厅快速对比</caption>
          <thead><tr>
            <th scope="col">项目</th>
            ${restaurants.map((restaurant, index) => `<th scope="col"><span class="compare-number">${index + 1}</span>${escapeHtml(restaurant.name)}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${rows.map(([label, ...values]) => `<tr><th scope="row">${escapeHtml(label)}</th>${values.map((value) => `<td>${compareCell(value)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>`;
  }

  function renderOverviewMapShell(restaurants) {
    if (!restaurants.some(validCoords)) return '';
    return `<section class="panel overview-panel">
      <div class="section-heading">
        <div>
          <h2>三家位置总览</h2>
        </div>
      </div>
      <div id="overview-map" class="overview-map" aria-label="三家餐厅位置总览地图"></div>
    </section>`;
  }

  function eligible(restaurant) {
    if (!hasGooglePlaceId(restaurant)) return false;
    const frozenInventory = restaurant.inventoryWithinRadius === true;
    if (!frozenInventory && restaurant.googleStatus !== 'verified') return false;
    const hasDistance = Number.isFinite(restaurant.distanceMeters);
    if (hasDistance) {
      if (restaurant.distanceMeters < 0 || restaurant.distanceMeters > MAX_DISTANCE) return false;
      if (restaurant.distanceMeters > distanceLimit) return false;
    } else {
      // Frozen inventory membership proves <=1.2 km, but not a smaller distance bucket.
      if (!frozenInventory || distanceLimit !== MAX_DISTANCE) return false;
    }
    if (!validCoords(restaurant) && !frozenInventory) return false;
    if (rejected.has(displayCuisine(restaurant))) return false;
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
      const bounds = [[NII_REFERENCE.lat, NII_REFERENCE.lng]];
      mappable.forEach(({ restaurant, index }) => {
        const point = [restaurant.lat, restaurant.lng];
        bounds.push(point);
        const popup = `<b>${escapeHtml(restaurant.name)}</b><br>${escapeHtml([displayCuisine(restaurant), distanceText(restaurant)].filter(Boolean).join(' · '))}<br><a href="${escapeHtml(mapsUrl(restaurant))}" target="_blank" rel="noopener">在 Google Maps 查看 ↗</a>`;
        L.marker(point, { icon: numberIcon(index + 1) })
          .addTo(overview)
          .bindPopup(popup);
      });

      L.circleMarker([NII_REFERENCE.lat, NII_REFERENCE.lng], {
        radius: 8,
        color: '#a61b1b',
        weight: 2,
        fillColor: '#e53935',
        fillOpacity: 0.95,
        interactive: false,
        bubblingMouseEvents: false
      }).addTo(overview);

      overview.fitBounds(bounds, { padding: [34, 34], maxZoom: 16 });
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
    const buttonFor = (label) => `<button type="button" class="chip" data-tag="${escapeHtml(label)}" aria-pressed="false">${escapeHtml(label)}</button>`;
    const common = cuisineLabels.slice(0, PRIMARY_CUISINE_COUNT).map(buttonFor).join('');
    const more = secondaryCuisines.length
      ? `<details class="more-cuisines"><summary id="more-cuisines-summary">更多菜系（${secondaryCuisines.length}）</summary><div class="chips secondary-cuisines">${secondaryCuisines.map(buttonFor).join('')}</div></details>`
      : '';
    box.innerHTML = common + more;
    if (!cuisineLabels.length) {
      const module = $('[data-filter-module="food"]');
      if (module) module.hidden = true;
    }
    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tag]');
      if (!button) return;
      const cuisine = button.dataset.tag;
      if (rejected.has(cuisine)) rejected.delete(cuisine);
      else rejected.add(cuisine);
      const selected = rejected.has(cuisine);
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
      if (secondaryCuisines.length) {
        const count = secondaryCuisines.filter((label) => rejected.has(label)).length;
        const summary = $('#more-cuisines-summary');
        if (summary) summary.textContent = count
          ? `更多菜系（已排除 ${count} 项）`
          : `更多菜系（${secondaryCuisines.length}）`;
      }
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
    const node = $('#stats');
    if (node) node.textContent = `当前可选 ${production.length.toLocaleString()} 家餐厅`;
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
      <div class="result-summary">从 ${pool.length.toLocaleString()} 家中选出 3 家</div>
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