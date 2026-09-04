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
  const filterEnabled = { food: true, budget: true, distance: true };

  const validPrice = (price) => Array.isArray(price)
    && price.length >= 2
    && Number.isFinite(price[0])
    && Number.isFinite(price[1]);

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

    // Maximize cuisine diversity first, then fill any remaining slots. Distinct
    // cuisines are a preference, not a condition that can make generation fail.
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
    return '预算未知';
  }

  function priceMatches(price, min, max = Infinity) {
    if (!validPrice(price)) return false;
    return price[0] <= max && price[1] >= min;
  }

  function budgetOK(restaurant) {
    if (!filterEnabled.budget || budget === 'all') return true;
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

  function holidayText(restaurant) {
    if (restaurant.closedDays?.length) return `定休：${restaurant.closedDays.join('、')}`;
    if (restaurant.openingHoursRaw) return restaurant.openingHoursRaw;
    if (restaurant.closedNote) return restaurant.closedNote;
    return '营业时间未知，请出发前确认';
  }

  function mapsUrl(restaurant) {
    const query = encodeURIComponent(
      [restaurant.name, restaurant.address].filter(Boolean).join(', ') || restaurant.name
    );
    const placeId = encodeURIComponent(restaurant.googlePlaceId);
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${placeId}&utm_source=eat&utm_campaign=place_details_search`;
  }

  function badgeHtml(restaurant) {
    const badges = ['<span class="pill verified">身份已核验</span>'];
    if (restaurant.hyakumeiten) {
      const award = [restaurant.hyakumeitenYear, restaurant.hyakumeitenCategory]
        .filter(Boolean)
        .join(' · ');
      badges.push(`<span class="pill hyakumeiten">百名店${award ? ` ${escapeHtml(award)}` : ''}</span>`);
    }
    return badges.join('');
  }

  function renderCard(restaurant, index) {
    const dishes = (restaurant.dishes || []).slice(0, 2).map(escapeHtml).join(' · ');
    return `<article class="card result-card">
      <div class="card-main">
        <div class="result-heading">
          <span class="result-number">${index + 1}</span>
          <h2>${escapeHtml(restaurant.name)}</h2>
        </div>
        <div class="meta">
          ${badgeHtml(restaurant)}
          <span class="pill">${escapeHtml(restaurant.cuisine)}</span>
          <span class="pill">${escapeHtml(distanceText(restaurant))}</span>
        </div>
        <p class="budget"><b>预算：</b>${escapeHtml(budgetText(restaurant))}</p>
        ${dishes ? `<p class="dish"><b>可以吃：</b>${dishes}</p>` : ''}
        <p class="hours"><b>营业：</b>${escapeHtml(holidayText(restaurant))}</p>
        <a class="maps-link primary-link" href="${escapeHtml(mapsUrl(restaurant))}" target="_blank" rel="noopener">在 Google Maps 查看 ↗</a>
      </div>
    </article>`;
  }

  function eligible(restaurant) {
    if (!restaurant.googlePlaceId || restaurant.googleStatus !== 'verified') return false;
    if (!Number.isFinite(restaurant.distanceMeters) || restaurant.distanceMeters > MAX_DISTANCE) return false;
    if (filterEnabled.distance && restaurant.distanceMeters > distanceLimit) return false;
    if (filterEnabled.food && rejected.has(restaurant.cuisine)) return false;
    return budgetOK(restaurant);
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
    $('#results').innerHTML = `<div class="panel empty">${escapeHtml(message)}</div>`;
  }

  function generate() {
    const pool = production.filter(eligible);
    if (pool.length < 3) {
      showMessage(`当前条件下只有 ${pool.length} 家可选；请放宽预算、距离或菜系排除条件。`);
      return;
    }

    const result = pickThree(pool);
    $('#results').innerHTML = `<div class="result-summary">从 ${pool.length} 家符合条件的店里随机选出 3 家；优先避免重复菜系。</div>${result.map(renderCard).join('')}`;
  }

  $$('[data-filter-toggle]').forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.filterToggle;
      filterEnabled[key] = !filterEnabled[key];
      button.classList.toggle('active', filterEnabled[key]);
      button.setAttribute('aria-pressed', String(filterEnabled[key]));
      button.textContent = filterEnabled[key] ? '启用' : '关闭';
      button.closest('.filter-module').classList.toggle('filter-off', !filterEnabled[key]);
    };
  });

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
  renderStats();
})();
