const state = {
  manifest: [],
  gameCache: new Map(),
  selectedFilters: new Set(),
  search: "",
  page: "achievements",
  gameId: "GTAV",
  selectedAchievementTitle: ""
};

const GTAV_ENHANCED_TITLE_GROUPS = {
  doomsday: new Set(["The Data Breaches", "The Bogdan Problem", "A Friendship Resurrected", "The Doomsday Scenario"]),
  directorMode: new Set(["Method Actor", "First Time Director", "Vinewood Visionary", "Majestic", "Location Scout", "Animal Lover", "Ensemble Piece", "Cult Movie", "Humans of Los Santos"]),
  storyHeists: new Set(["Blitzed", "Small Town, Big Job", "The Big One!"]),
  openWorld: new Set(["Trading Pure Alpha", "All's Fare in Love and War", "Wanted: Alive or Alive", "TP Industries Arms Race", "Waste Management", "San Andreas Sightseer", "A Mystery, Solved", "Altruist Acolyte", "Kifflom!"]),
  collectibles: new Set(["Show Off", "Close Shave", "From Beyond the Stars", "Waste Management", "A Mystery, Solved", "Location Scout"]),
  challenge: new Set(["Red Mist", "Three Man Army", "Solid Gold, Baby!", "Multi-Disciplined", "Career Criminal", "Cryptozoologist"])
};

const app = document.querySelector("#app");
const sidebarNav = document.querySelector("#sidebar-nav");
const sidebar = document.querySelector("#sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");

sidebarToggle?.addEventListener("click", () => {
  sidebar.classList.toggle("is-open");
});

document.addEventListener("click", (event) => {
  const navigationTarget = event.target.closest("a[data-page], a[data-page-link], .game-link");
  if (navigationTarget) {
    handleNavigation(event, navigationTarget);
    return;
  }

  if (window.innerWidth > 991 || !sidebar.classList.contains("is-open")) {
    return;
  }

  const clickedInsideSidebar = sidebar.contains(event.target);
  const clickedToggle = sidebarToggle?.contains(event.target);

  if (!clickedInsideSidebar && !clickedToggle) {
    sidebar.classList.remove("is-open");
  }
});

window.addEventListener("popstate", () => {
  syncStateFromUrl();
  renderPage();
});

init().catch((error) => {
  console.error(error);
  app.innerHTML = `
    <section class="info-card glass-panel">
      <h2 class="section-title">Unable to load tracker</h2>
      <p class="section-copy">The static data files could not be loaded. Serve the project through a local web server and try again.</p>
    </section>
  `;
});

async function init() {
  state.manifest = await fetchJson("data/games.json");
  syncStateFromUrl();
  await renderPage();
}

function syncStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get("page");
  const requestedGameId = params.get("game");
  const requestedAchievementTitle = params.get("achievement") ?? "";
  const requestedSearch = params.get("q") ?? "";
  const requestedFilters = params.getAll("filter").filter(Boolean);

  state.page = ["home", "achievements", "achievement-guide", "settings"].includes(requestedPage) ? requestedPage : "achievements";
  state.gameId = state.manifest.some((game) => game.id === requestedGameId)
    ? requestedGameId
    : state.manifest[0]?.id ?? "GTAV";
  state.selectedAchievementTitle = requestedAchievementTitle;
  state.search = requestedSearch.trim().toLowerCase();
  state.selectedFilters = new Set(requestedFilters);

  if (state.page === "achievement-guide") {
    state.page = "achievements";
  }
}

function updateUrl(page, gameId = state.gameId, achievementTitle = state.selectedAchievementTitle) {
  const params = new URLSearchParams();
  params.set("page", page);

  if (page === "achievements" || page === "achievement-guide") {
    params.set("game", gameId);
  }

  if (["achievements", "achievement-guide"].includes(page) && achievementTitle) {
    params.set("achievement", achievementTitle);
  }

  if (["achievements", "achievement-guide"].includes(page)) {
    if (state.search) {
      params.set("q", state.search);
    }

    [...state.selectedFilters]
      .sort((left, right) => left.localeCompare(right))
      .forEach((filter) => params.append("filter", filter));
  }

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, "", nextUrl);
  state.page = page;
  state.gameId = gameId;
  state.selectedAchievementTitle = ["achievements", "achievement-guide"].includes(page) ? achievementTitle : "";
}

function syncAchievementBrowserUrl(replace = false) {
  const params = new URLSearchParams();
  params.set("page", "achievements");
  params.set("game", state.gameId);

  if (state.selectedAchievementTitle) {
    params.set("achievement", state.selectedAchievementTitle);
  }

  if (state.search) {
    params.set("q", state.search);
  }

  [...state.selectedFilters]
    .sort((left, right) => left.localeCompare(right))
    .forEach((filter) => params.append("filter", filter));

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
  state.page = "achievements";
}

function renderSidebar() {
  const gameLinks = state.manifest.map((game) => {
    const isActive = ["achievements", "achievement-guide"].includes(state.page) && state.gameId === game.id;

    return `
      <a class="game-link ${isActive ? "active" : ""}" href="?page=achievements&game=${game.id}" data-page="achievements" data-game-id="${game.id}">
        ${renderGameLogo(game, "sidebar-game-logo")}
        <span>${game.shortName}</span>
      </a>
    `;
  }).join("");

  sidebarNav.innerHTML = `
    <a class="nav-link-item ${state.page === "home" ? "active" : ""}" href="?page=home" data-page-link="home">
      <span class="nav-icon"><i class="bi bi-house"></i></span>
      <span>Home</span>
    </a>
    <button class="nav-group-toggle active" type="button" aria-expanded="true">
      <span class="d-flex align-items-center gap-2">
        <span class="nav-icon"><i class="bi bi-list-check"></i></span>
        <span class="nav-label">Achievements</span>
      </span>
      <span class="nav-icon"><i class="bi bi-chevron-down"></i></span>
    </button>
    <div class="games-list">${gameLinks}</div>
  `;
}

async function renderPage() {
  renderSidebar();

  if (state.page === "home") {
    renderHomePage();
    return;
  }

  if (state.page === "settings") {
    renderSettingsPage();
    return;
  }

  const game = await getGameData(state.gameId);

  initializeFilters(game);
  renderAchievementsPage(game);
}

function renderHomePage() {
  const gameCards = state.manifest.map((game) => `
    <article class="game-card glass-panel" style="border-color:${hexToAlpha(game.accent, 0.4)};">
      <div class="game-card-top">
        ${renderGameLogo(game, "card-game-logo")}
        <span class="pill">${game.platform}</span>
      </div>
      <h2 class="card-title">${game.name}</h2>
      <p class="card-copy">${game.summary}</p>
      <p class="section-copy mb-3">${game.totalAchievements} achievements tracked in this local JSON dataset.</p>
      <a class="btn btn-sm btn-accent" href="?page=achievements&game=${game.id}" data-page="achievements" data-game-id="${game.id}">Open tracker</a>
    </article>
  `).join("");

  app.innerHTML = `
    <div class="page-grid">
      <section class="hero-panel glass-panel">
        <div class="hero-content">
          <div class="hero-eyebrow">Steam progress dashboard</div>
          <h2 class="hero-title">Track every chaotic climb through the GTA catalog.</h2>
          <p class="hero-copy">This static tracker mirrors the Halo Achievement Tracker layout, rebuilt for Grand Theft Auto on Steam with Bootstrap, Bootstrap Icons, and local JSON files for each game.</p>
          <div class="hero-actions">
            <a class="btn btn-accent" href="?page=achievements&game=${state.manifest[0]?.id}" data-page="achievements" data-game-id="${state.manifest[0]?.id}">Browse achievements</a>
            <a class="btn btn-ghost" href="?page=settings" data-page-link="settings">View project notes</a>
          </div>
        </div>
      </section>

      <section class="info-card glass-panel">
        <h2 class="section-title">Available Games</h2>
        <p class="section-copy">Each entry is loaded from its own JSON file and rendered into the same achievement browser layout.</p>
        <div class="game-grid">${gameCards}</div>
      </section>
    </div>
  `;
}

function renderSettingsPage() {
  app.innerHTML = `
    <section class="settings-card glass-panel">
      <div class="settings-label">Project configuration</div>
      <h2 class="section-title">Static Build Notes</h2>
      <p class="section-copy">This page stays static by design. The interface, filters, and routing are handled in vanilla JavaScript, while each game loads from its own JSON dataset under the data directory.</p>
      <div class="settings-grid mt-4">
        <article class="info-card glass-panel">
          <div class="settings-label">Stack</div>
          <h3 class="card-title">Bootstrap + Icons</h3>
          <p class="section-copy mb-0">Layout, buttons, form controls, and iconography are provided through Bootstrap 5 and Bootstrap Icons over a custom CSS skin.</p>
        </article>
        <article class="info-card glass-panel">
          <div class="settings-label">Routing</div>
          <h3 class="card-title">Query-string pages</h3>
          <p class="section-copy mb-0">The tracker uses page and game parameters to switch between the home, achievements, and settings screens without a framework.</p>
        </article>
        <article class="info-card glass-panel">
          <div class="settings-label">Data</div>
          <h3 class="card-title">Per-game JSON files</h3>
          <p class="section-copy mb-0">Add or expand datasets in the data/games folder and the UI will pick them up through the manifest file.</p>
        </article>
      </div>
    </section>
  `;
}

function renderAchievementsPage(game) {
  const filters = getAvailableFilters(game);
  const achievements = getFilteredAchievements(game.achievements);
  const activeAchievement = achievements.find((achievement) => achievement.title === state.selectedAchievementTitle) || null;

  if (!activeAchievement && state.selectedAchievementTitle) {
    state.selectedAchievementTitle = "";
    syncAchievementBrowserUrl(true);
  }

  app.innerHTML = `
    <div class="page-grid">
      <section class="summary-card glass-panel">
        <div class="summary-top">
          ${renderGameLogo(game, "summary-game-logo")}
          <div>
            <h2 class="summary-title">${game.name}</h2>
            <div class="summary-subtitle">${game.subtitle}</div>
          </div>
        </div>
        <div class="summary-bottom">
          <div class="summary-metric">${game.achievements.length} ACHIEVEMENTS</div>
        </div>
      </section>

      <section class="achievements-layout">
        <aside class="filters-card glass-panel">
          <div class="filter-label">Filter Criteria</div>
          <div class="filter-group mt-3">
            ${filters.map((filter) => `
              <label class="filter-control form-check">
                <input class="form-check-input" type="checkbox" value="${filter}" ${state.selectedFilters.has(filter) ? "checked" : ""}>
                <span class="form-check-label">${filter}</span>
              </label>
            `).join("")}
          </div>
          <div class="filter-label mt-4">Search</div>
          <input id="achievement-search" class="form-control search-input mt-2" type="search" placeholder="Find an achievement" value="${escapeHtml(state.search)}">
        </aside>

        <section class="list-card glass-panel">
          <div class="list-toolbar">
            <div>
              <div class="filter-label">Achievements</div>
              <div class="achievement-meta">Showing ${achievements.length} of ${game.achievements.length} entries</div>
            </div>
            <button class="btn btn-sm btn-ghost" id="reset-filters" type="button">Reset filters</button>
          </div>
          <div class="achievement-list">
            ${achievements.length > 0 ? achievements.map((achievement, index) => renderAchievementListEntry(game, achievement, achievements, index)).join("") : '<div class="empty-state">No achievements match the current filters.</div>'}
          </div>
        </section>
      </section>
    </div>
  `;

  app.querySelectorAll(".form-check-input").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const { value, checked } = event.target;

      if (checked) {
        state.selectedFilters.add(value);
      } else {
        state.selectedFilters.delete(value);
      }

      syncAchievementBrowserUrl(true);
      renderAchievementsPage(game);
    });
  });

  app.querySelector("#achievement-search")?.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    syncAchievementBrowserUrl(true);
    renderAchievementsPage(game);
  });

  app.querySelector("#reset-filters")?.addEventListener("click", () => {
    state.selectedFilters = new Set(filters);
    state.search = "";
    syncAchievementBrowserUrl(true);
    renderAchievementsPage(game);
  });

  app.querySelectorAll("[data-achievement-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTitle = button.dataset.achievementTitle || "";
      const shouldOpen = state.selectedAchievementTitle !== nextTitle;
      state.selectedAchievementTitle = state.selectedAchievementTitle === nextTitle ? "" : nextTitle;
      syncAchievementBrowserUrl();
      renderAchievementsPage(game);

      if (shouldOpen) {
        scrollAchievementIntoView(nextTitle);
      }
    });
  });
}

function renderAchievementGuidePage(game) {
  const achievement = getAchievementByTitle(game.achievements, state.selectedAchievementTitle);
  const contextAchievements = getGuideContextAchievements(game);
  const currentIndex = contextAchievements.findIndex((entry) => entry.title === state.selectedAchievementTitle);
  const previousAchievement = currentIndex > 0 ? contextAchievements[currentIndex - 1] : null;
  const nextAchievement = currentIndex >= 0 && currentIndex < contextAchievements.length - 1 ? contextAchievements[currentIndex + 1] : null;
  const resultsLabel = contextAchievements.length === game.achievements.length
    ? `${game.achievements.length} total achievements`
    : `${contextAchievements.length} matching achievements`;

  if (!achievement) {
    app.innerHTML = `
      <section class="detail-card glass-panel">
        <div class="detail-label">Achievement Guide</div>
        <h2 class="section-title">Guide not found</h2>
        <p class="section-copy">The selected achievement could not be found for ${game.name}. Open the tracker and choose an achievement from the list.</p>
        <div class="guide-page-actions">
          <a class="btn btn-sm btn-accent" href="?page=achievements&game=${game.id}" data-page="achievements" data-game-id="${game.id}">Back to achievements</a>
        </div>
      </section>
    `;
    return;
  }

  const guide = buildAchievementGuide(game, achievement);
  const videoGuide = getAchievementVideo(achievement);
  const tags = uniqueText([achievement.category, ...achievement.tags]);
  const description = achievement.description?.trim();

  app.innerHTML = `
    <div class="page-grid">
      <nav class="guide-breadcrumbs" aria-label="Breadcrumb">
        <a href="?page=home" data-page-link="home">Home</a>
        <span>/</span>
        <a href="?page=achievements&game=${game.id}" data-page="achievements" data-game-id="${game.id}">${game.shortName}</a>
        <span>/</span>
        <span>${achievement.title}</span>
      </nav>

      <section class="summary-card glass-panel">
        <div class="summary-top">
          ${renderGameLogo(game, "summary-game-logo")}
          <div>
            <div class="detail-label">Achievement Guide</div>
            <h2 class="summary-title">${achievement.title}</h2>
            <div class="summary-subtitle">${game.name} • ${resultsLabel}</div>
          </div>
        </div>
        <div class="summary-bottom">
          <div class="summary-metric">${achievement.rarity}% PLAYERS UNLOCKED</div>
        </div>
      </section>

      <section class="guide-page-actions">
        <a class="btn btn-sm btn-ghost" href="?page=achievements&game=${game.id}" data-page="achievements" data-game-id="${game.id}">Back to achievements</a>
        ${videoGuide?.watchUrl ? `<a class="btn btn-sm btn-accent" href="${videoGuide.watchUrl}" target="_blank" rel="noreferrer noopener">Watch on YouTube</a>` : ""}
      </section>

      <section class="guide-nav-card glass-panel">
        <div class="guide-nav-meta">${currentIndex >= 0 ? `Result ${currentIndex + 1} of ${contextAchievements.length}` : resultsLabel}</div>
        <div class="guide-nav-actions">
          ${previousAchievement ? `<a class="btn btn-sm btn-ghost" href="${buildAchievementGuideHref(game.id, previousAchievement.title)}" data-page="achievement-guide" data-game-id="${game.id}" data-achievement-title="${escapeHtml(previousAchievement.title)}">Previous: ${previousAchievement.title}</a>` : `<span class="guide-nav-placeholder">No previous achievement</span>`}
          ${nextAchievement ? `<a class="btn btn-sm btn-ghost" href="${buildAchievementGuideHref(game.id, nextAchievement.title)}" data-page="achievement-guide" data-game-id="${game.id}" data-achievement-title="${escapeHtml(nextAchievement.title)}">Next: ${nextAchievement.title}</a>` : `<span class="guide-nav-placeholder">No next achievement</span>`}
        </div>
      </section>

      <section class="detail-card glass-panel guide-page-card">
        ${videoGuide?.embedUrl ? `
          <section class="guide-video-card glass-panel">
            <div class="detail-section-title">Video Guide</div>
            <div class="guide-video-frame-wrap">
              <iframe
                class="guide-video-frame"
                src="${videoGuide.embedUrl}"
                title="${escapeHtml(videoGuide.title || `${achievement.title} video guide`)}"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                referrerpolicy="strict-origin-when-cross-origin"
                allowfullscreen>
              </iframe>
            </div>
            <div class="guide-video-meta">
              <div class="guide-video-title">${videoGuide.title || `${achievement.title} video guide`}</div>
              ${videoGuide.channel ? `<div class="guide-video-channel">${videoGuide.channel}</div>` : ""}
            </div>
          </section>
        ` : `
          <section class="guide-video-card glass-panel guide-video-card-empty">
            <div class="detail-section-title">Video Guide</div>
            <p class="detail-note mb-0">A verified video is still being matched for this achievement.</p>
          </section>
        `}

        <div class="detail-header">
          ${achievement.image ? `<img class="detail-art" src="${escapeHtml(achievement.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
          <div>
            <div class="detail-subtitle">${game.subtitle}</div>
            ${description ? `<p class="detail-overview mb-0">${description}</p>` : ""}
          </div>
        </div>

        <div class="detail-stats">
          ${tags.map((tag) => `<span class="pill">${tag}</span>`).join("")}
        </div>

        <p class="detail-overview">${guide.overview}</p>

        <div class="detail-grid">
          <div>
            <div class="detail-section-title">How To Unlock It</div>
            <ol class="guide-list">
              ${guide.steps.map((step) => `<li>${step}</li>`).join("")}
            </ol>
          </div>
          <div>
            <div class="detail-section-title">Helpful Tips</div>
            <ul class="guide-list guide-tips">
              ${guide.tips.map((tip) => `<li>${tip}</li>`).join("")}
            </ul>
          </div>
        </div>

        <div class="detail-actions">
          ${videoGuide?.watchUrl ? `<a class="btn btn-sm btn-accent" href="${videoGuide.watchUrl}" target="_blank" rel="noreferrer noopener">Watch on YouTube</a>` : ""}
          <a class="btn btn-sm btn-ghost" href="?page=achievements&game=${game.id}" data-page="achievements" data-game-id="${game.id}">Browse ${game.totalAchievements} achievements</a>
          <div class="detail-note">The embedded player loads the resolved guide video directly on this page.</div>
        </div>
      </section>
    </div>
  `;
}

function renderAchievementCard(game, achievement) {
  const metaItems = [
    achievement.category,
    ...achievement.tags.filter((tag) => tag.toLowerCase() !== achievement.category.toLowerCase())
  ];

  const media = achievement.image
    ? `<div class="achievement-badge achievement-badge-art"><img class="achievement-art" src="${escapeHtml(achievement.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
    : `<div class="achievement-badge" style="background-color:${achievement.color};"><i class="bi ${achievement.icon}"></i></div>`;

  const description = achievement.description
    ? `<div class="achievement-description">${achievement.description}</div>`
    : "";

  return `
    <button class="achievement-card ${state.selectedAchievementTitle === achievement.title ? "is-active" : ""}" type="button" data-achievement-toggle="true" data-achievement-title="${escapeHtml(achievement.title)}" aria-expanded="${state.selectedAchievementTitle === achievement.title ? "true" : "false"}">
      ${media}
      <div>
        <h3 class="achievement-title">${achievement.title}</h3>
        ${description}
        <div class="achievement-meta">${metaItems.join(" • ")}</div>
      </div>
      <div class="achievement-rarity">
        <div class="rarity-value">${achievement.rarity}%</div>
        <div class="rarity-label">players unlocked</div>
      </div>
    </button>
  `;
}

function renderAchievementListEntry(game, achievement, achievements, index) {
  const card = renderAchievementCard(game, achievement);

  if (state.selectedAchievementTitle !== achievement.title) {
    return card;
  }

  const previousAchievement = index > 0 ? achievements[index - 1] : null;
  const nextAchievement = index < achievements.length - 1 ? achievements[index + 1] : null;

  return `${card}${renderInlineAchievementDetail(game, achievement, achievements.length, index, previousAchievement, nextAchievement)}`;
}

function renderInlineAchievementDetail(game, achievement, totalAchievements, index, previousAchievement, nextAchievement) {
  const guide = buildAchievementGuide(game, achievement);
  const videoGuide = getAchievementVideo(achievement);
  const tags = uniqueText([achievement.category, ...achievement.tags]);
  const description = achievement.description?.trim();

  return `
    <section class="detail-card glass-panel inline-achievement-detail" data-inline-achievement-detail="${escapeHtml(achievement.title)}">
      <div class="inline-detail-topbar">
        <div class="guide-nav-meta">Result ${index + 1} of ${totalAchievements}</div>
        <div class="inline-detail-actions">
          ${previousAchievement ? `<button class="btn btn-sm btn-ghost" type="button" data-achievement-toggle="true" data-achievement-title="${escapeHtml(previousAchievement.title)}">Previous: ${previousAchievement.title}</button>` : ""}
          ${nextAchievement ? `<button class="btn btn-sm btn-ghost" type="button" data-achievement-toggle="true" data-achievement-title="${escapeHtml(nextAchievement.title)}">Next: ${nextAchievement.title}</button>` : ""}
        </div>
      </div>

      ${videoGuide?.embedUrl ? `
        <section class="guide-video-card glass-panel">
          <div class="detail-section-title">Video Guide</div>
          <div class="guide-video-frame-wrap">
            <iframe
              class="guide-video-frame"
              src="${videoGuide.embedUrl}"
              title="${escapeHtml(videoGuide.title || `${achievement.title} video guide`)}"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen>
            </iframe>
          </div>
          <div class="guide-video-meta">
            <div class="guide-video-title">${videoGuide.title || `${achievement.title} video guide`}</div>
            ${videoGuide.channel ? `<div class="guide-video-channel">${videoGuide.channel}</div>` : ""}
          </div>
        </section>
      ` : `
        <section class="guide-video-card glass-panel guide-video-card-empty">
          <div class="detail-section-title">Video Guide</div>
          <p class="detail-note mb-0">A verified video is still being matched for this achievement.</p>
        </section>
      `}

      <div class="detail-header">
        ${achievement.image ? `<img class="detail-art" src="${escapeHtml(achievement.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
        <div>
          <div class="detail-label">Achievement Guide</div>
          <h3 class="detail-title">${achievement.title}</h3>
          <div class="detail-subtitle">${game.name} • ${achievement.rarity}% players unlocked</div>
          ${description ? `<p class="detail-overview mb-0">${description}</p>` : ""}
        </div>
      </div>

      <div class="detail-stats">
        ${tags.map((tag) => `<span class="pill">${tag}</span>`).join("")}
      </div>

      <p class="detail-overview">${guide.overview}</p>

      <div class="detail-grid">
        <div>
          <div class="detail-section-title">How To Unlock It</div>
          <ol class="guide-list">
            ${guide.steps.map((step) => `<li>${step}</li>`).join("")}
          </ol>
        </div>
        <div>
          <div class="detail-section-title">Helpful Tips</div>
          <ul class="guide-list guide-tips">
            ${guide.tips.map((tip) => `<li>${tip}</li>`).join("")}
          </ul>
        </div>
      </div>

      <div class="detail-actions">
        ${videoGuide?.watchUrl ? `<a class="btn btn-sm btn-accent" href="${videoGuide.watchUrl}" target="_blank" rel="noreferrer noopener">Watch on YouTube</a>` : ""}
        <button class="btn btn-sm btn-ghost" type="button" data-achievement-toggle="true" data-achievement-title="${escapeHtml(achievement.title)}">Collapse guide</button>
        <div class="detail-note">Only one achievement guide stays open at a time.</div>
      </div>
    </section>
  `;
}

function scrollAchievementIntoView(achievementTitle) {
  requestAnimationFrame(() => {
    const selector = `[data-achievement-toggle][data-achievement-title="${cssEscape(achievementTitle)}"]`;
    const selectedCard = app.querySelector(selector);

    selectedCard?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

function renderGameLogo(game, className = "game-logo") {
  if (!game.logo) {
    return `<span class="game-badge" style="background-color:${game.accent};">${game.badge}</span>`;
  }

  return `<img class="${className}" src="${escapeHtml(game.logo)}" alt="${escapeHtml(game.name)} logo" loading="lazy">`;
}

function handleNavigation(event, element) {
  event.preventDefault();

  const page = element.dataset.page || element.dataset.pageLink;
  const gameId = element.dataset.gameId || state.gameId;
  const achievementTitle = element.dataset.achievementTitle || "";

  const isSwitchingGame = gameId !== state.gameId;
  const isLeavingAchievementBrowser = !["achievements", "achievement-guide"].includes(page);

  if (isSwitchingGame || isLeavingAchievementBrowser) {
    state.search = "";
    state.selectedFilters.clear();
  }

  updateUrl(page, gameId, achievementTitle);
  sidebar.classList.remove("is-open");
  renderPage();
}

async function getGameData(gameId) {
  if (!state.gameCache.has(gameId)) {
    const manifestEntry = state.manifest.find((game) => game.id === gameId);
    const gameData = await fetchJson(manifestEntry.file);
    const mergedGameData = { ...manifestEntry, ...gameData };
    const enrichedGameData = gameId === "GTAV"
      ? enrichGtavEnhancedGameData(mergedGameData)
      : mergedGameData;

    state.gameCache.set(gameId, enrichedGameData);
  }

  return state.gameCache.get(gameId);
}

function enrichGtavEnhancedGameData(game) {
  return {
    ...game,
    achievements: game.achievements.map((achievement) => {
      const metadata = categorizeGtavEnhancedAchievement(achievement);

      return {
        ...achievement,
        category: metadata.category,
        tags: metadata.tags
      };
    })
  };
}

function categorizeGtavEnhancedAchievement(achievement) {
  const { title, description } = achievement;

  if (GTAV_ENHANCED_TITLE_GROUPS.doomsday.has(title)) {
    return {
      category: "Heists",
      tags: ["GTA Online", "Heists", "Doomsday"]
    };
  }

  if (GTAV_ENHANCED_TITLE_GROUPS.directorMode.has(title) || /Director Mode|Rockstar Editor/.test(description)) {
    const tags = ["Director Mode"];

    if (/Rockstar Editor/.test(description)) {
      tags.push("Rockstar Editor");
    }

    return {
      category: "Director Mode",
      tags
    };
  }

  if (description.startsWith("GTA Online:")) {
    const tags = ["GTA Online"];

    if (/Heist/i.test(description)) {
      tags.push("Heists");
    }

    if (/Rank|Awards|Introduction/i.test(description)) {
      tags.push("Progression");
    }

    if (/Vehicle|vehicles|races|driver|Rally|Helicopter/i.test(description)) {
      tags.push("Vehicles");
    }

    if (/Kill|Bounty|Gang Attack|Survival|damage/i.test(description)) {
      tags.push("Combat");
    }

    if (/Apartment|Garage|Stores|participate/i.test(description)) {
      tags.push("Open World");
    }

    return {
      category: "GTA Online",
      tags
    };
  }

  if (GTAV_ENHANCED_TITLE_GROUPS.storyHeists.has(title)) {
    return {
      category: "Story",
      tags: ["Story", "Heists"]
    };
  }

  if (GTAV_ENHANCED_TITLE_GROUPS.collectibles.has(title) || /Stunt Jumps|Under the Bridge|Knife Flight|spaceship parts|nuclear waste|Leonora Johnson/i.test(description)) {
    return {
      category: "Collectibles",
      tags: ["Collectibles", "Exploration"]
    };
  }

  if (GTAV_ENHANCED_TITLE_GROUPS.challenge.has(title) || /Wanted Level|Rampages|Gold Medals/i.test(description)) {
    return {
      category: "Challenge",
      tags: ["Challenge"]
    };
  }

  if (GTAV_ENHANCED_TITLE_GROUPS.openWorld.has(title) || /stock market|Cab Co\.|dock|Hangar|bail bond/i.test(description)) {
    return {
      category: "Open World",
      tags: ["Open World", "Side Content"]
    };
  }

  return {
    category: "Story",
    tags: ["Story"]
  };
}

function initializeFilters(game) {
  const filters = getAvailableFilters(game);
  const hasUnknownFilters = [...state.selectedFilters].some((value) => !filters.includes(value));

  if (state.selectedFilters.size === 0 || hasUnknownFilters) {
    state.selectedFilters = new Set(filters);
  }
}

function getSelectedAchievement(achievements) {
  if (achievements.length === 0) {
    state.selectedAchievementTitle = "";
    return null;
  }

  const selectedAchievement = achievements.find((achievement) => achievement.title === state.selectedAchievementTitle) || achievements[0];
  state.selectedAchievementTitle = selectedAchievement.title;
  return selectedAchievement;
}

function getAchievementByTitle(achievements, title) {
  return achievements.find((achievement) => achievement.title === title) || null;
}

function getGuideContextAchievements(game) {
  if (state.selectedFilters.size === 0 && state.search.length === 0) {
    return game.achievements;
  }

  return getFilteredAchievements(game.achievements);
}

function buildAchievementGuideHref(gameId, achievementTitle) {
  const params = new URLSearchParams();
  params.set("page", "achievement-guide");
  params.set("game", gameId);
  params.set("achievement", achievementTitle);

  if (state.search) {
    params.set("q", state.search);
  }

  [...state.selectedFilters]
    .sort((left, right) => left.localeCompare(right))
    .forEach((filter) => params.append("filter", filter));

  return `?${params.toString()}`;
}

function getAvailableFilters(game) {
  return [...new Set(game.achievements.flatMap((achievement) => achievement.tags))];
}

function getFilteredAchievements(achievements) {
  return achievements.filter((achievement) => {
    const matchesFilter = state.selectedFilters.size === 0 || achievement.tags.some((tag) => state.selectedFilters.has(tag));
    const haystack = `${achievement.title} ${achievement.description} ${achievement.category} ${achievement.tags.join(" ")}`.toLowerCase();
    const matchesSearch = state.search.length === 0 || haystack.includes(state.search);

    return matchesFilter && matchesSearch;
  });
}

function buildAchievementGuide(game, achievement) {
  const description = achievement.description?.trim();
  const missionName = description?.match(/"([^"]+)"/)?.[1] ?? null;
  const combinedText = `${achievement.category} ${achievement.tags.join(" ")} ${description ?? ""}`;
  const steps = [];
  const tips = [];

  if (missionName) {
    steps.push(`Progress through ${game.name} until the mission "${missionName}" becomes available, then complete it successfully.`);
    tips.push(`Save before starting "${missionName}" so you can retry quickly if the requirement is missed.`);
  } else if (description) {
    steps.push(`Focus on the exact requirement shown by the achievement: ${description}`);
  } else {
    steps.push(`Track the activity tied to ${achievement.title} and repeat it until the unlock condition is met.`);
  }

  if (/Story|Missions/.test(combinedText)) {
    steps.push(`Advance the main story and complete any prerequisite missions before attempting this unlock.`);
    tips.push(`Story achievements usually unlock on the mission-complete screen, so let the mission finish cleanly.`);
  }

  if (/GTA Online|Online/.test(combinedText)) {
    steps.push(`Load into GTA Online and complete the requirement in an online session with matchmaking or invite-only play as needed.`);
    tips.push(`Invite-only sessions can make progress faster by cutting out interference from other players.`);
  }

  if (/Vehicles|Driving|Bikes/.test(combinedText)) {
    steps.push(`Use a stable vehicle and restart the activity immediately if you crash, flip, or lose time on the attempt.`);
    tips.push(`Vehicle-related achievements are easier with upgraded handling and a route you already know.`);
  }

  if (/Combat|Challenge/.test(combinedText)) {
    steps.push(`Prepare armor, health, and the required weapons before starting so the challenge can be completed in one run.`);
    tips.push(`If the achievement involves a count, check the counter carefully and avoid switching activities mid-run.`);
  }

  if (/Completion|Collection/.test(combinedText)) {
    steps.push(`Use the in-game stats or map progress screens to keep track of what has already been completed or collected.`);
    tips.push(`Collection achievements are much easier if you clear them district by district instead of roaming randomly.`);
  }

  if (/Director Mode|Rockstar Editor/.test(combinedText)) {
    steps.push(`Open Director Mode or Rockstar Editor from the pause menu and complete the exact action tied to this unlock.`);
    tips.push(`Stay in the correct mode until the achievement fires, since leaving early can cancel progress.`);
  }

  if (/Activities|Lifestyle|Social|Service Jobs/.test(combinedText)) {
    steps.push(`Repeat the relevant side activity until the listed threshold or performance requirement has been met.`);
    tips.push(`Many side-activity achievements count cumulative progress, so partial runs still help unless the description says otherwise.`);
  }

  steps.push(`After finishing the requirement, wait for the achievement popup or Steam overlay confirmation before exiting the game.`);

  if (tips.length === 0) {
    tips.push(`Use the description as the primary checklist and repeat the activity in a clean run if the unlock does not appear immediately.`);
  }

  return {
    overview: description
      ? `${achievement.title} is unlocked by completing this requirement in ${game.name}: ${description}`
      : `${achievement.title} is a hidden or minimally-described achievement in ${game.name}. Use the steps below to force a clean unlock attempt.`,
    steps: uniqueText(steps).slice(0, 5),
    tips: uniqueText(tips).slice(0, 4)
  };
}

function getAchievementVideo(achievement) {
  const videoId = achievement.videoId || extractYouTubeVideoId(achievement.videoUrl || "");

  if (!videoId) {
    return null;
  }

  const embedOrigin = encodeURIComponent(window.location.origin);
  const embedReferrer = encodeURIComponent(window.location.href);

  return {
    id: videoId,
    watchUrl: achievement.videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&origin=${embedOrigin}&widget_referrer=${embedReferrer}`,
    title: achievement.videoTitle || "",
    channel: achievement.videoChannel || ""
  };
}

function extractYouTubeVideoId(url) {
  const match = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  return match?.[1] ?? "";
}

function uniqueText(items) {
  return [...new Set(items.filter(Boolean))];
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return response.json();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function hexToAlpha(hex, alpha) {
  const cleanHex = hex.replace("#", "");
  const bigint = parseInt(cleanHex, 16);
  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
