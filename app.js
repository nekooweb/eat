(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const AREA1_MAX_DISTANCE = 1200;
  const raw = window.RESTAURANTS || [];

  let profile = 'TOKYO';
  let area = '地区1️⃣';
  let budget = 'all';
  let distanceLimit = AREA1_MAX_DISTANCE;
  const rejected = new Set();
  const filterEnabled = { food: true, budget: true, distance: true };

  const norm = (value) => (value || '')
    .replace(/[\s　・’'"\-—_()（）]+/g, '')
    .toLowerCase();

  const uniq = (values) => [...new Set(values.filter(Boolean))];
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

  function haversine(lat1, lng1, lat2, lng2) {
    const earthRadius = 6371000;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2
      + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function googleCuisine(restaurant) {
    const cuisineByType = {
      japanese_curry_restaurant: '咖喱',
      ramen_restaurant: '拉面',
      udon_restaurant: '乌冬',
      soba_restaurant: '荞麦面',
      japanese_restaurant: '日式',
      chinese_restaurant: '中华',
      korean_restaurant: '韩国菜',
      thai_restaurant: '泰国菜',
      indian_restaurant: '印度菜',
      italian_restaurant: '意大利菜',
      french_restaurant: '法餐',
      pizza_restaurant: '披萨',
      hamburger_restaurant: '汉堡',
      seafood_restaurant: '海鲜',
      sushi_restaurant: '寿司',
      steak_house: '牛排',
      barbecue_restaurant: '烧烤',
      yakitori_restaurant: '烧鸟',
      tonkatsu_restaurant: '炸猪排',
      cafe: '咖啡',
      coffee_shop: '咖啡',
      bakery: '面包・烘焙',
      dessert_shop: '甜品',
      ice_cream_shop: '甜品',
      confectionery: '甜品',
      meal_takeaway: '快餐'
    };

    return cuisineByType[restaurant.googlePrimaryType]
      || (restaurant.cuisine && restaurant.cuisine !== '餐厅' ? restaurant.cuisine : '餐厅');
  }

  function compatible(googleRestaurant, legacyRestaurant) {
    if (googleRestaurant.googlePlaceId
      && legacyRestaurant.googlePlaceId
      && googleRestaurant.googlePlaceId === legacyRestaurant.googlePlaceId) return true;

    if (norm(googleRestaurant.name) !== norm(legacyRestaurant.name)) return false;

    const coordinates = [
      googleRestaurant.lat,
      googleRestaurant.lng,
      legacyRestaurant.lat,
      legacyRestaurant.lng
    ];
    if (coordinates.every(Number.isFinite)) {
      return haversine(
        googleRestaurant.lat,
        googleRestaurant.lng,
        legacyRestaurant.lat,
        legacyRestaurant.lng
      ) <= 250;
    }
    return true;
  }

  // Temporary migration layer. This is intentionally isolated so it can be moved
  // into the build pipeline without touching filtering or rendering logic.
  function buildProductionDataset() {
    const legacy = raw.filter((restaurant) => restaurant.source !== 'Google Places');
    const byPlaceId = new Map();
    const byName = new Map();

    legacy.forEach((restaurant) => {
      if (restaurant.googlePlaceId) {
        if (!byPlaceId.has(restaurant.googlePlaceId)) byPlaceId.set(restaurant.googlePlaceId, []);
        byPlaceId.get(restaurant.googlePlaceId).push(restaurant);
      }
      const normalizedName = norm(restaurant.name);
      if (normalizedName) {
        if (!byName.has(normalizedName)) byName.set(normalizedName, []);
        byName.get(normalizedName).push(restaurant);
      }
    });

    return raw
      .filter((restaurant) => restaurant.source === 'Google Places' && restaurant.googleStatus === 'verified')
      .map((googleRestaurant) => {
        const matches = uniq([
          ...(byPlaceId.get(googleRestaurant.googlePlaceId) || []),
          ...(byName.get(norm(googleRestaurant.name)) || [])
        ]).filter((legacyRestaurant) => compatible(googleRestaurant, legacyRestaurant));

        const specificCuisine = matches
          .map((restaurant) => restaurant.cuisine)
          .find((cuisine) => cuisine && cuisine !== '餐厅');
        const cuisine = specificCuisine || googleCuisine(googleRestaurant);
        const tags = uniq([cuisine, ...matches.flatMap((restaurant) => restaurant.tags || [])])
          .filter((tag) => tag !== '餐厅' || cuisine === '餐厅');
        const lunch = matches.map((restaurant) => restaurant.lunch).find(validPrice) || null;
        const dinner = matches.map((restaurant) => restaurant.dinner).find(validPrice) || null;
        const dishes = uniq(matches.flatMap((restaurant) => restaurant.dishes || [])).slice(0, 4);
        const openingHoursRaw = matches.map((restaurant) => restaurant.openingHoursRaw).find(Boolean) || null;
        const closedDays = matches
          .map((restaurant) => restaurant.closedDays)
          .find((days) => Array.isArray(days) && days.length) || [];
        const closedNote = matches.map((restaurant) => restaurant.closedNote).find(Boolean) || null;
        const hyakumeiten = Boolean(googleRestaurant.hyakumeiten)
          || matches.some((restaurant) => restaurant.hyakumeiten);
        const award = matches.find((restaurant) => restaurant.hyakumeiten) || googleRestaurant;
        const distanceMeters = Number.isFinite(googleRestaurant.distanceMeters)
          ? googleRestaurant.distanceMeters
          : googleRestaurant.distance;

        return {
          ...googleRestaurant,
          cuisine,
          tags,
          distance: Math.round(distanceMeters),
          distanceMeters,
          lunch,
          dinner,
          dishes,
          openingHoursRaw,
          closedDays,
          closedNote,
          hyakumeiten,
          hyakumeitenYear: googleRestaurant.hyakumeitenYear || award.hyakumeitenYear,
          hyakumeitenCategory: googleRestaurant.hyakumeitenCategory || award.hyakumeitenCategory,
          randomWeight: hyakumeiten ? 2.2 : 1
        };
      })
      .filter((restaurant) => restaurant.profile === 'TOKYO'
        && restaurant.area === '地区1️⃣'
        && Number.isFinite(restaurant.distanceMeters)
        && restaurant.distanceMeters <= AREA1_MAX_DISTANCE);
  }

  const production = window.PRODUCTION_RESTAURANTS || buildProductionDataset();
  const cuisineLabels = [...new Set(production.map((restaurant) => restaurant.cuisine).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));

  function rand01() {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] / 0x100000000;
  }

  function weightedPick(items) {
    if (!items.length) return null;
    let remaining = rand01() * items.reduce((sum, item) => sum + (item.randomWeight || 1), 0);
    for (const item of items) {
      remaining -= item.randomWeight || 1;
      if (remaining < 0) return item;
    }
    return items[items.length - 1];
  }

  function weightedIndex(groups) {
    const weights = groups.map(([, restaurants]) => restaurants
      .reduce((sum, restaurant) => sum + (restaurant.randomWeight || 1), 0));
    let remaining = rand01() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < weights.length; index += 1) {
      remaining -= weights[index];
      if (remaining < 0) return index;
    }
    return weights.length - 1;
  }

  function shuffle(items) {
    const output = [...items];
    for (let i = output.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand01() * (i + 1));
      [output[i], output[j]] = [output[j], output[i]];
    }
    return output;
  }

  function pickThree(pool) {
    if (pool.length < 3) return [];

    const groups = new Map();
    pool.forEach((restaurant) => {
      const key = restaurant.cuisine || '餐厅';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(restaurant);
    });

    const availableGroups = [...groups.entries()];
    const selected = [];

    // Prefer distinct cuisines, but never block a valid three-store result merely
    // because fewer than three cuisine families remain after filtering.
    while (selected.length < 3 && availableGroups.length) {
      const index = weightedIndex(availableGroups);
      const [, restaurants] = availableGroups.splice(index, 1)[0];
      const picked = weightedPick(restaurants);
      if (picked) selected.push(picked);
    }

    if (selected.length < 3) {
      const selectedIds = new Set(selected.map((restaurant) => restaurant.id));
      const remaining = pool.filter((restaurant) => !selectedIds.has(restaurant.id));
      while (selected.length < 3 && remaining.length) {
        const picked = weightedPick(remaining);
        if (!picked) break;
        selected.push(picked);
        remaining.splice(remaining.indexOf(picked), 1);
      }
    }

    return shuffle(selected);
  }

  function currentPrice(restaurant) {
    const hour = new Date().getHours();
    return hour < 16
      ? (restaurant.lunch || restaurant.dinner)
      : (restaurant.dinner || restaurant.lunch);
  }

  function priceText(price) {
    if (!price) return '预算未知';
    if (price[0] === 0) return `¥${price[1].toLocaleString()}以下`;
    return `¥${price[0].toLocaleString()}–${price[1].toLocaleString()}`;
  }

  function distanceText(restaurant) {
    const distance = Number.isFinite(restaurant.distanceMeters)
      ? restaurant.distanceMeters
      : restaurant.distance;
    return distance >= 1000
      ? `约${(distance / 1000).toFixed(1)}km`
      : `约${Math.round(distance / 10) * 10}m`;
  }

  function budgetOK(restaurant) {
    if (!filterEnabled.budget || budget === 'all') return true;
    const price = currentPrice(restaurant);
    if (!price) return false;
    const [low, high] = price;
    if (budget === 'under1000') return high <= 999;
    if (budget === '1000') return low <= 1999 && high >= 1000;
    if (budget === '2000') return low <= 3999 && high >= 2000;
    if (budget === '4000') return high >= 4000;
    return true;
  }

  function holidayText(restaurant) {
    if (restaurant.closedDays?.length) return `定休：${restaurant.closedDays.join('、')}`;
    if (restaurant.openingHoursRaw) return restaurant.openingHoursRaw;
    if (restaurant.closedNote) return restaurant.closedNote;
    return '营业时间未知，请出发前确认';
  }

  function mapsUrl(restaurant) {
    const query = encodeURIComponent([restaurant.name, restaurant.address].filter(Boolean).join(', ') || restaurant.name);
    if (restaurant.googlePlaceId) {
      return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(restaurant.googlePlaceId)}`;
    }
    if (restaurant.googleMapsUrl) return restaurant.googleMapsUrl;
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  function badgeHtml(restaurant) {
    const badges = ['<span class="pill verified">已核验</span>'];
    if (restaurant.hyakumeiten) {
      const award = [restaurant.hyakumeitenYear, restaurant.hyakumeitenCategory]
        .filter(Boolean)
        .join(' · ');
      badges.push(`<span class="pill hyakumeiten">百名店${award ? ` ${escapeHtml(award)}` : ''}</span>`);
    }
    if (restaurant.googleBusinessStatus === 'CLOSED_TEMPORARILY') {
      badges.push('<span class="pill status-warn">暂时歇业</span>');
    }
    return badges.join('');
  }

  function renderCuisineFilters() {
    const box = $('#rejects');
    box.innerHTML = cuisineLabels
      .map((label) => `<button type="button" class="chip" data-tag="${escapeHtml(label)}">${escapeHtml(label)}</button>`)
      .join('');

    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tag]');
      if (!button) return;
      const tag = button.dataset.tag;
      if (rejected.has(tag)) rejected.delete(tag);
      else rejected.add(tag);
      button.classList.toggle('active', rejected.has(tag));
    });
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
          <span class="pill price">${escapeHtml(priceText(currentPrice(restaurant)))}</span>
        </div>
        ${dishes ? `<p class="dish"><b>可以吃：</b>${dishes}</p>` : ''}
        <p class="hours"><b>营业：</b>${escapeHtml(holidayText(restaurant))}</p>
        <a class="maps-link primary-link" href="${escapeHtml(mapsUrl(restaurant))}" target="_blank" rel="noopener">在 Google Maps 查看 ↗</a>
      </div>
    </article>`;
  }

  function eligible(restaurant) {
    if (restaurant.profile !== profile || restaurant.area !== area) return false;
    if (!Number.isFinite(restaurant.distanceMeters) || restaurant.distanceMeters > AREA1_MAX_DISTANCE) return false;
    if (filterEnabled.distance && restaurant.distanceMeters > distanceLimit) return false;
    if (filterEnabled.food
      && (rejected.has(restaurant.cuisine)
        || (restaurant.tags || []).some((tag) => rejected.has(tag)))) return false;
    return budgetOK(restaurant);
  }

  function renderStats() {
    const total = production.length;
    const budgetKnown = production.filter((restaurant) => validPrice(restaurant.lunch) || validPrice(restaurant.dinner)).length;
    const cuisineKnown = production.filter((restaurant) => restaurant.cuisine && restaurant.cuisine !== '餐厅').length;
    const awards = production.filter((restaurant) => restaurant.hyakumeiten).length;
    $('#stats').innerHTML = `可推荐 <b>${total.toLocaleString()}</b> 家 · 菜系 <b>${cuisineKnown.toLocaleString()}</b> · 有预算 <b>${budgetKnown.toLocaleString()}</b> · 百名店 <b>${awards.toLocaleString()}</b>`;
  }

  function showMessage(message) {
    $('#results').innerHTML = `<div class="panel empty">${escapeHtml(message)}</div>`;
  }

  function generate() {
    if (profile !== 'TOKYO') {
      showMessage('SHIZUOKA 目前还是 TBD。');
      return;
    }
    if (area !== '地区1️⃣') {
      showMessage('地区2️⃣ 的生产数据尚未建立。');
      return;
    }

    const pool = production.filter(eligible);
    if (pool.length < 3) {
      showMessage(`当前条件下只有 ${pool.length} 家可选；请放宽预算、距离或菜系排除条件。`);
      return;
    }

    const result = pickThree(pool);
    $('#results').innerHTML = `<div class="result-summary">从 ${pool.length} 家符合条件的店里随机选出 3 家；优先避免重复菜系。</div>${result
      .map(renderCard)
      .join('')}`;
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

  $$('[data-profile]').forEach((button) => {
    button.onclick = () => {
      $$('[data-profile]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      profile = button.dataset.profile;
    };
  });

  $$('[data-area]').forEach((button) => {
    button.onclick = () => {
      $$('[data-area]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      area = button.dataset.area;
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
  renderCuisineFilters();
  renderStats();
})();
