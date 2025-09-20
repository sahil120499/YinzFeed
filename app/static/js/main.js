const API_ROUTES = {
  meta: "/api/mls/meta",
  summary: "/api/mls/summary",
  teams: "/api/mls/teams",
  sponsors: "/api/mls/sponsors",
  activations: "/api/mls/activations",
  opportunities: "/api/mls/opportunities",
  features: "/api/mls/features",
  mode2Leagues: "/api/mode2/leagues",
  mode2Teams: "/api/mode2/teams",
};

const DEFAULT_STATE = () => ({
  clientType: "all",
  teams: new Set(),
  sponsorNames: new Set(),
  sponsorCategories: new Set(),
  inventoryTypes: new Set(),
  distinctSponsorsOnly: false,
  activationChannels: new Set(),
  activationFormats: new Set(),
  interactivityLevels: new Set(),
  hasInApp: false,
  hasLoyalty: false,
  hasCommerce: false,
  opportunityTypes: new Set(),
  opportunitySeverity: new Set(),
  showGapsOnly: false,
  featureCategories: new Set(),
  featureSubfeatures: new Set(),
  coverageMode: "all",
  quickFilters: new Set(),
  view: "teams",
  mode: "mode-1",
  compareSelection: new Set(),
  mode2Placeholder: "",
  mode2League: "mls",
  mode2Team: "",
  sidebarCollapsed: false,
});

const store = {
  meta: null,
  summary: null,
  teams: [],
  sponsors: null,
  activations: [],
  opportunities: null,
  features: null,
  derived: {},
  mode2: { leagues: [], teams: [], teamMap: new Map() },
};

const state = DEFAULT_STATE();
let savedViews = [];

function cloneSet(source) {
  return new Set(Array.from(source));
}

function setState(updater) {
  if (typeof updater === "function") {
    updater(state);
  }
  render();
  syncURL();
}

async function fetchJSON(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status})`);
  }
  return response.json();
}

async function bootstrap() {
  try {
    const [
      meta,
      summary,
      teamsPayload,
      sponsors,
      activationsPayload,
      opportunities,
      features,
      mode2LeaguesPayload,
      mode2TeamsPayload,
    ] = await Promise.all([
      fetchJSON(API_ROUTES.meta, "Meta"),
      fetchJSON(API_ROUTES.summary, "Summary"),
      fetchJSON(API_ROUTES.teams, "Teams"),
      fetchJSON(API_ROUTES.sponsors, "Sponsors"),
      fetchJSON(API_ROUTES.activations, "Activations"),
      fetchJSON(API_ROUTES.opportunities, "Opportunities"),
      fetchJSON(API_ROUTES.features, "Features"),
      fetchJSON(API_ROUTES.mode2Leagues, "Mode 2 leagues"),
      fetchJSON(API_ROUTES.mode2Teams, "Mode 2 teams"),
    ]);

    store.meta = meta;
    store.summary = summary;
    store.teams = teamsPayload.teams ?? [];
    store.sponsors = sponsors;
    store.activations = activationsPayload.activations ?? [];
    store.opportunities = opportunities;
    store.features = features;
    store.mode2.leagues = mode2LeaguesPayload.leagues ?? [];
    store.mode2.teams = mode2TeamsPayload.teams ?? [];
    store.mode2.teamMap = new Map(store.mode2.teams.map((team) => [team.id, team]));

    buildDerivedIndexes();
    hydrateFilters();
    hydrateQuickFilters();
    hydrateMode2Controls();
    hydrateSavedViews();
    loadStateFromURL();
    render();
    bindEvents();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Failed to load data");
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);

function buildDerivedIndexes() {
  const teamMap = new Map();
  const sponsorNameSet = new Set();
  const sponsorCategorySet = new Set();
  const inventoryTypeSet = new Set();
  const channelSet = new Set();
  const formatSet = new Set();
  const interactivitySet = new Set();
  const opportunityTypeSet = new Set();
  const opportunitySeveritySet = new Set();
  const featureCategorySet = new Set();
  const featureSubfeatureSet = new Set();

  store.teams.forEach((team) => {
    teamMap.set(team.id, team);
    team.sponsors.forEach((row) => {
      sponsorNameSet.add(row.sponsor);
      sponsorCategorySet.add(row.category);
      inventoryTypeSet.add(row.inventory_type);
      channelSet.add(row.channel);
      formatSet.add(row.format);
      interactivitySet.add(row.interactivity_level);
    });
    team.opportunities.forEach((opp) => {
      opportunityTypeSet.add(opp.type);
      opportunitySeveritySet.add(opp.severity);
    });
  });

  const featureTaxonomy = store.features?.taxonomy ?? {};
  Object.entries(featureTaxonomy).forEach(([key, features]) => {
    const label = store.features.labels?.[key] ?? key;
    featureCategorySet.add(label);
    features.forEach((feature) => {
      featureSubfeatureSet.add(feature);
    });
  });

  store.derived = {
    teamMap,
    sponsorNames: Array.from(sponsorNameSet).sort((a, b) => a.localeCompare(b)),
    sponsorCategories: Array.from(sponsorCategorySet).sort((a, b) => a.localeCompare(b)),
    inventoryTypes: Array.from(inventoryTypeSet).sort((a, b) => a.localeCompare(b)),
    activationChannels: Array.from(channelSet).sort((a, b) => a.localeCompare(b)),
    activationFormats: Array.from(formatSet).sort((a, b) => a.localeCompare(b)),
    interactivityLevels: Array.from(interactivitySet).sort((a, b) => a.localeCompare(b)),
    opportunityTypes: Array.from(opportunityTypeSet).sort((a, b) => a.localeCompare(b)),
    opportunitySeverities: Array.from(opportunitySeveritySet).sort((a, b) => a.localeCompare(b)),
    featureCategories: Array.from(featureCategorySet).sort((a, b) => a.localeCompare(b)),
    featureSubfeatures: Array.from(featureSubfeatureSet).sort((a, b) => a.localeCompare(b)),
  };
}

function hydrateFilters() {
  renderCheckboxList("team-filter-options", store.teams.map((team) => ({
    label: `${team.name}`,
    value: team.id,
  })));

  renderCheckboxList("sponsor-name-options", store.derived.sponsorNames.map((name) => ({
    label: name,
    value: name,
  })));

  renderCheckboxList("sponsor-category-options", store.derived.sponsorCategories.map((category) => ({
    label: category,
    value: category,
  })));

  renderCheckboxList("inventory-type-options", store.derived.inventoryTypes.map((type) => ({
    label: type,
    value: type,
  })));

  renderCheckboxList("activation-channel-options", store.derived.activationChannels.map((channel) => ({
    label: channel,
    value: channel,
  })));

  renderCheckboxList("activation-format-options", store.derived.activationFormats.map((format) => ({
    label: format,
    value: format,
  })));

  renderCheckboxList("interactivity-options", store.derived.interactivityLevels.map((level) => ({
    label: level,
    value: level,
  })));

  renderCheckboxList("opportunity-type-options", store.derived.opportunityTypes.map((type) => ({
    label: type,
    value: type,
  })));

  renderCheckboxList("opportunity-severity-options", store.derived.opportunitySeverities.map((severity) => ({
    label: severity,
    value: severity,
  })));

  renderCheckboxList("feature-category-options", store.derived.featureCategories.map((category) => ({
    label: category,
    value: category,
  })));

  renderCheckboxList("feature-subfeature-options", store.derived.featureSubfeatures.map((feature) => ({
    label: feature,
    value: feature,
  })));
}

function hydrateQuickFilters() {
  const quickToggles = document.querySelectorAll("[data-quick]");
  quickToggles.forEach((toggle) => {
    toggle.checked = state.quickFilters.has(toggle.dataset.quick);
  });
}

function hydrateMode2Controls() {
  const leagueSelect = document.getElementById("mode2-league-select");
  if (leagueSelect) {
    const options = store.mode2.leagues.length
      ? store.mode2.leagues
          .map((league) => `<option value="${league.id}">${league.name}</option>`)
          .join("")
      : '<option value="mls">MLS</option>';
    leagueSelect.innerHTML = options;
    if (!store.mode2.leagues.find((league) => league.id === state.mode2League) && store.mode2.leagues.length) {
      state.mode2League = store.mode2.leagues[0].id;
    }
    leagueSelect.value = state.mode2League;
  }

  const teamSelect = document.getElementById("mode2-team-select");
  if (teamSelect) {
    populateMode2TeamOptions(teamSelect);
  }
}

function populateMode2TeamOptions(teamSelect) {
  const teams = store.mode2.teams.filter((team) => team.league_id === state.mode2League);
  const options = ['<option value="">Select a team</option>']
    .concat(teams.map((team) => `<option value="${team.id}">${team.name}</option>`))
    .join("");
  teamSelect.innerHTML = options;
  if (!teams.some((team) => team.id === state.mode2Team)) {
    state.mode2Team = "";
  }
  teamSelect.value = state.mode2Team;
}


function hydrateSavedViews() {
  try {
    const raw = window.localStorage.getItem("yinzfeed_saved_views");
    if (raw) {
      savedViews = JSON.parse(raw);
    }
  } catch (error) {
    console.warn("Unable to read saved views", error);
  }
}

function renderCheckboxList(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <label class="checkbox">
          <input type="checkbox" value="${item.value}" />
          <span>${item.label}</span>
        </label>
      `
    )
    .join("");
}

function bindEvents() {
  document.getElementById("reset-filters")?.addEventListener("click", handleResetFilters);
  document.getElementById("save-view")?.addEventListener("click", handleSaveView);
  document.getElementById("share-view")?.addEventListener("click", handleShareView);
  document.getElementById("team-search")?.addEventListener("input", handleTeamSearch);
  document.getElementById("sponsor-search")?.addEventListener("input", handleSponsorSearch);

  bindCheckboxGroup("team-filter-options", state.teams);
  bindCheckboxGroup("sponsor-name-options", state.sponsorNames);
  bindCheckboxGroup("sponsor-category-options", state.sponsorCategories);
  bindCheckboxGroup("inventory-type-options", state.inventoryTypes);
  bindCheckboxGroup("activation-channel-options", state.activationChannels);
  bindCheckboxGroup("activation-format-options", state.activationFormats);
  bindCheckboxGroup("interactivity-options", state.interactivityLevels);
  bindCheckboxGroup("opportunity-type-options", state.opportunityTypes);
  bindCheckboxGroup("opportunity-severity-options", state.opportunitySeverity);
  bindCheckboxGroup("feature-category-options", state.featureCategories);
  bindCheckboxGroup("feature-subfeature-options", state.featureSubfeatures);

  document.querySelectorAll(".pill-select [data-client]").forEach((button) => {
    button.addEventListener("click", () => {
      setClientType(button.dataset.client ?? "all");
    });
  });

  document.querySelectorAll(".pill-select [data-coverage]").forEach((button) => {
    button.addEventListener("click", () => {
      setCoverageMode(button.dataset.coverage ?? "all");
    });
  });

  document.getElementById("distinct-sponsor-toggle")?.addEventListener("change", (event) => {
    setState((draft) => {
      draft.distinctSponsorsOnly = event.target.checked;
    });
  });

  document.getElementById("has-in-app-toggle")?.addEventListener("change", (event) => {
    setState((draft) => {
      draft.hasInApp = event.target.checked;
    });
  });

  document.getElementById("has-loyalty-toggle")?.addEventListener("change", (event) => {
    setState((draft) => {
      draft.hasLoyalty = event.target.checked;
    });
  });

  document.getElementById("has-commerce-toggle")?.addEventListener("change", (event) => {
    setState((draft) => {
      draft.hasCommerce = event.target.checked;
    });
  });

  document.querySelectorAll("[data-quick]").forEach((toggle) => {
    toggle.addEventListener("change", () => handleQuickToggle(toggle));
  });

  document.getElementById("show-gaps-toggle")?.addEventListener("change", (event) => {
    setState((draft) => {
      draft.showGapsOnly = event.target.checked;
    });
  });

  document.querySelectorAll(".switcher-btn").forEach((button) => {
    button.addEventListener("click", () => changeView(button.dataset.view));
  });

  document.querySelectorAll(".mode-switch .btn.toggle").forEach((button) => {
    button.addEventListener("click", () => changeMode(button.dataset.mode));
  });

  document.getElementById("open-compare")?.addEventListener("click", openCompareDrawer);
  document.getElementById("team-export")?.addEventListener("click", exportTeamCSV);
  document.getElementById("activations-export")?.addEventListener("click", exportActivationsCSV);
  document.getElementById("activations-copy")?.addEventListener("click", copyActivationsToClipboard);
  document.getElementById("opportunity-export")?.addEventListener("click", exportOpportunitiesCSV);
  document.getElementById("feature-export")?.addEventListener("click", exportFeaturesCSV);
  document.getElementById("mode2-league-select")?.addEventListener("change", handleMode2LeagueChange);
  document.getElementById("mode2-team-select")?.addEventListener("change", handleMode2TeamChange);
  document.getElementById("sidebar-toggle")?.addEventListener("click", toggleSidebar);

  document.querySelectorAll("[data-close-drawer]").forEach((button) => {
    button.addEventListener("click", () => {
      const drawer = button.closest(".drawer");
      closeDrawer(drawer?.id);
    });
  });
}

function bindCheckboxGroup(containerId, targetSet) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }
  container.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const value = input.value;
    setState((draft) => {
      if (input.checked) {
        targetSet.add(value);
      } else {
        targetSet.delete(value);
      }
    });
  });
}

function handleTeamSearch(event) {
  filterListByInput(event.target, "team-filter-options");
}

function handleSponsorSearch(event) {
  filterListByInput(event.target, "sponsor-name-options");
}

function filterListByInput(input, containerId) {
  const term = input.value.trim().toLowerCase();
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }
  container.querySelectorAll("label").forEach((label) => {
    const text = label.textContent?.toLowerCase() ?? "";
    label.hidden = term ? !text.includes(term) : false;
  });
}

function handleResetFilters() {
  const nextState = DEFAULT_STATE();
  Object.assign(state, nextState);
  hydrateFilters();
  hydrateQuickFilters();
  document.getElementById("distinct-sponsor-toggle").checked = false;
  document.getElementById("has-in-app-toggle").checked = false;
  document.getElementById("has-loyalty-toggle").checked = false;
  document.getElementById("has-commerce-toggle").checked = false;
  document.getElementById("show-gaps-toggle").checked = false;
  document.querySelectorAll(".pill-select [data-client]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.client === "all" ? "true" : "false");
    button.classList.toggle("active", button.dataset.client === "all");
  });
  document.querySelectorAll(".pill-select [data-coverage]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.coverage === "all" ? "true" : "false");
    button.classList.toggle("active", button.dataset.coverage === "all");
  });
  changeView("teams");
  render();
  syncURL();
}

function changeView(view) {
  if (!view || state.view === view) {
    return;
  }
  state.view = view;
  document.querySelectorAll(".switcher-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    const isActive = panel.dataset.view === view;
    panel.classList.toggle("hidden", !isActive);
  });
  render();
  syncURL();
}

function changeMode(mode) {
  if (!mode || state.mode === mode) {
    return;
  }
  state.mode = mode;
  document.querySelectorAll(".mode-switch .btn.toggle").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  document.querySelectorAll(".dashboard").forEach((panel) => {
    const isActive = panel.dataset.mode === mode;
    panel.classList.toggle("hidden", !isActive);
  });
  render();
  syncURL();
}

function setClientType(type) {
  if (state.clientType === type) {
    return;
  }
  setState((draft) => {
    draft.clientType = type;
    document.querySelectorAll(".pill-select [data-client]").forEach((button) => {
      const isActive = button.dataset.client === type;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.classList.toggle("active", isActive);
    });
  });
}

function setCoverageMode(mode) {
  if (state.coverageMode === mode) {
    return;
  }
  setState((draft) => {
    draft.coverageMode = mode;
    document.querySelectorAll(".pill-select [data-coverage]").forEach((button) => {
      const isActive = button.dataset.coverage === mode;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.classList.toggle("active", isActive);
    });
  });
}

function handleQuickToggle(toggle) {
  const key = toggle.dataset.quick;
  const checked = toggle.checked;
  setState((draft) => {
    if (checked) {
      draft.quickFilters.add(key);
    } else {
      draft.quickFilters.delete(key);
    }
    applyQuickFilterEffects();
  });
}

function applyQuickFilterEffects() {
  if (state.quickFilters.has("non-yinzcam")) {
    state.clientType = "non";
    document.querySelectorAll(".pill-select [data-client]").forEach((button) => {
      const isActive = button.dataset.client === "non";
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.classList.toggle("active", isActive);
    });
  }
  if (state.quickFilters.has("in-app-only")) {
    state.hasInApp = true;
    document.getElementById("has-in-app-toggle").checked = true;
  }
  if (state.quickFilters.has("presented-by")) {
    state.activationFormats.add("Content Branding");
    syncCheckboxGroup("activation-format-options", state.activationFormats);
  }
  if (state.quickFilters.has("stadium-naming")) {
    state.inventoryTypes.add("Stadium Naming");
    syncCheckboxGroup("inventory-type-options", state.inventoryTypes);
  }
  if (state.quickFilters.has("health-partner")) {
    state.sponsorCategories.add("Healthcare");
    syncCheckboxGroup("sponsor-category-options", state.sponsorCategories);
  }
  if (state.quickFilters.has("high-activation")) {
    // handled during filtering when computing stats
  }
}

function handleMode2LeagueChange(event) {
  const leagueId = event.target.value || "mls";
  setState((draft) => {
    draft.mode2League = leagueId;
    draft.mode2Team = "";
  });
}

function handleMode2TeamChange(event) {
  setState((draft) => {
    draft.mode2Team = event.target.value || "";
  });
}

function toggleSidebar() {
  setState((draft) => {
    draft.sidebarCollapsed = !draft.sidebarCollapsed;
  });
}

function applySidebarState() {
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  const toggle = document.getElementById("sidebar-toggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  }
}


function syncCheckboxGroup(containerId, activeSet) {
  document.querySelectorAll(`#${containerId} input[type="checkbox"]`).forEach((input) => {
    input.checked = activeSet.has(input.value);
  });
}

function render() {
  const filtered = computeFilteredData();
  renderScopeChips(filtered);
  renderKPIs(filtered);
  renderActiveFilterChips();
  renderView(filtered);
  renderMode2();
  applySidebarState();
}

function computeFilteredData() {
  const teams = store.teams.filter((team) => teamPassesFilters(team));

  const teamIdSet = new Set(teams.map((team) => team.id));

  const activations = store.activations.filter((row) => {
    if (!teamIdSet.has(row.team_id)) {
      return false;
    }
    if (state.sponsorNames.size && !state.sponsorNames.has(row.sponsor)) {
      return false;
    }
    if (state.sponsorCategories.size && !state.sponsorCategories.has(row.category)) {
      return false;
    }
    if (state.inventoryTypes.size && !state.inventoryTypes.has(row.inventory_type)) {
      return false;
    }
    if (state.activationChannels.size && !state.activationChannels.has(row.channel)) {
      return false;
    }
    if (state.activationFormats.size && !state.activationFormats.has(row.format)) {
      return false;
    }
    if (state.interactivityLevels.size && !state.interactivityLevels.has(row.interactivity_level)) {
      return false;
    }
    if (state.hasInApp && !row.has_in_app) {
      return false;
    }
    if (state.hasLoyalty && !row.has_loyalty) {
      return false;
    }
    if (state.hasCommerce && !row.has_commerce) {
      return false;
    }
    if (state.quickFilters.has("presented-by") && !/presented by/i.test(`${row.where_how} ${row.notes}`)) {
      return false;
    }
    if (state.quickFilters.has("stadium-naming") && row.inventory_type !== "Stadium Naming") {
      return false;
    }
    if (state.quickFilters.has("health-partner") && row.category !== "Healthcare") {
      return false;
    }
    if (state.quickFilters.has("in-app-only") && !row.has_in_app) {
      return false;
    }
    return true;
  });

  const opportunities = (store.opportunities.list ?? []).filter((opp) => {
    if (!teamIdSet.has(opp.team_id)) {
      return false;
    }
    if (state.opportunityTypes.size && !state.opportunityTypes.has(opp.type)) {
      return false;
    }
    if (state.opportunitySeverity.size && !state.opportunitySeverity.has(opp.severity)) {
      return false;
    }
    return true;
  });

  const opportunityMatrix = {};
  teams.forEach((team) => {
    opportunityMatrix[team.id] = store.opportunities.matrix?.[team.id] ?? {};
  });

  const featureCoverage = buildFeatureCoverage(teamIdSet);

  return {
    teams,
    activations,
    opportunities,
    opportunityMatrix,
    featureCoverage,
    teamIdSet,
  };
}

function teamPassesFilters(team) {
  if (state.clientType === "yinzcam" && !team.is_yinzcam) {
    return false;
  }
  if (state.clientType === "non" && team.is_yinzcam) {
    return false;
  }
  if (state.teams.size && !state.teams.has(team.id)) {
    return false;
  }
  if (state.hasInApp && !team.totals.in_app_activations) {
    return false;
  }
  if (state.hasLoyalty && !team.sponsors.some((row) => row.has_loyalty)) {
    return false;
  }
  if (state.hasCommerce && !team.sponsors.some((row) => row.has_commerce)) {
    return false;
  }
  if (state.quickFilters.has("non-yinzcam") && team.is_yinzcam) {
    return false;
  }
  if (state.quickFilters.has("in-app-only") && !team.sponsors.some((row) => row.has_in_app)) {
    return false;
  }
  if (state.quickFilters.has("presented-by") && !team.sponsors.some((row) => /presented by/i.test(`${row.where_how} ${row.notes}`))) {
    return false;
  }
  if (state.quickFilters.has("stadium-naming") && !team.sponsors.some((row) => row.inventory_type === "Stadium Naming")) {
    return false;
  }
  if (state.quickFilters.has("health-partner") && !team.sponsors.some((row) => row.category === "Healthcare")) {
    return false;
  }
  if (state.quickFilters.has("high-activation") && team.totals.activation_score < 0.4) {
    return false;
  }
  if (state.sponsorNames.size && !team.sponsors.some((row) => state.sponsorNames.has(row.sponsor))) {
    return false;
  }
  if (state.sponsorCategories.size && !team.sponsors.some((row) => state.sponsorCategories.has(row.category))) {
    return false;
  }
  if (state.inventoryTypes.size && !team.sponsors.some((row) => state.inventoryTypes.has(row.inventory_type))) {
    return false;
  }
  if (state.activationChannels.size && !team.sponsors.some((row) => state.activationChannels.has(row.channel))) {
    return false;
  }
  if (state.activationFormats.size && !team.sponsors.some((row) => state.activationFormats.has(row.format))) {
    return false;
  }
  if (state.interactivityLevels.size && !team.sponsors.some((row) => state.interactivityLevels.has(row.interactivity_level))) {
    return false;
  }
  if (state.opportunityTypes.size && !team.opportunities.some((opportunity) => state.opportunityTypes.has(opportunity.type))) {
    return false;
  }
  if (state.opportunitySeverity.size && !team.opportunities.some((opportunity) => state.opportunitySeverity.has(opportunity.severity))) {
    return false;
  }
  if (state.showGapsOnly && !team.opportunities.length) {
    return false;
  }

  if (state.featureCategories.size || state.featureSubfeatures.size || state.coverageMode !== "all") {
    const coverage = store.features.coverage?.[team.id] ?? {};
    const taxonomy = store.features.taxonomy ?? {};
    const labels = store.features.labels ?? {};
    const categorySelection = Array.from(state.featureCategories);
    const subFeatureSelection = Array.from(state.featureSubfeatures);

    if (categorySelection.length) {
      const passesCategory = categorySelection.some((categoryLabel) => {
        return Object.entries(taxonomy).some(([key, subfeatures]) => {
          const label = labels[key] ?? key;
          if (label !== categoryLabel) {
            return false;
          }
          return subfeatures.some((feature) => {
            const status = coverage[feature] ?? "unknown";
            if (state.coverageMode === "has") {
              return status === "present";
            }
            if (state.coverageMode === "lacks") {
              return status !== "present";
            }
            return true;
          });
        });
      });
      if (!passesCategory) {
        return false;
      }
    }

    if (subFeatureSelection.length) {
      const matches = subFeatureSelection.every((feature) => {
        const status = coverage[feature] ?? "unknown";
        if (state.coverageMode === "has") {
          return status === "present";
        }
        if (state.coverageMode === "lacks") {
          return status !== "present";
        }
        return true;
      });
      if (!matches) {
        return false;
      }
    }

    if (!subFeatureSelection.length && !categorySelection.length && state.coverageMode !== "all") {
      const hasPresentFeature = Object.values(coverage).some((status) => status === "present");
      if (state.coverageMode === "has" && !hasPresentFeature) {
        return false;
      }
      if (state.coverageMode === "lacks" && hasPresentFeature) {
        return false;
      }
    }
  }

  return true;
}

function buildFeatureCoverage(teamIdSet) {
  const taxonomy = store.features?.taxonomy ?? {};
  const labels = store.features?.labels ?? {};
  const coverage = store.features?.coverage ?? {};

  const rows = [];
  teamIdSet.forEach((teamId) => {
    const team = store.derived.teamMap.get(teamId);
    const teamCoverage = coverage[teamId] ?? {};
    rows.push({ teamId, teamName: team?.name ?? teamId, coverage: teamCoverage });
  });

  return { taxonomy, labels, rows };
}

function renderScopeChips(filtered) {
  const container = document.getElementById("scope-chip-row");
  if (!container) {
    return;
  }
  const totalTeams = store.meta?.team_count ?? store.teams.length;
  const teamCount = filtered.teams.length;
  const selectedTeamsCount = state.teams.size;
  const clientLabel = state.clientType === "yinzcam" ? "YinzCam" : state.clientType === "non" ? "Non-YinzCam" : "All";
  const scope = state.teams.size ? `${selectedTeamsCount} selected` : `${teamCount} of ${totalTeams}`;

  container.innerHTML = `
    <span class="scope-chip">League: MLS</span>
    <span class="scope-chip">Teams: ${scope}</span>
    <span class="scope-chip">Client type: ${clientLabel}</span>
  `;
}

function renderKPIs(filtered) {
  const grid = document.getElementById("kpi-grid");
  if (!grid) {
    return;
  }
  const uniqueSponsorNames = new Set();
  let inApp = 0;
  let totalRows = 0;

  filtered.activations.forEach((row) => {
    uniqueSponsorNames.add(row.sponsor);
    if (row.has_in_app) {
      inApp += 1;
    }
    totalRows += 1;
  });

  const activationScore = totalRows ? (inApp / totalRows) * 100 : 0;
  const opportunitiesPerTeam = filtered.teams.length ? filtered.opportunities.length / filtered.teams.length : 0;

  const topCategories = summariseCategories(filtered.activations).slice(0, 3);

  grid.innerHTML = `
    ${renderKpiCard("TOTAL SPONSORS", uniqueSponsorNames.size)}
    ${renderKpiCard("IN-APP ACTIVATIONS", `${inApp} <span>(${percentage(inApp, totalRows)})</span>`)}
    ${renderKpiCard("ACTIVATION SCORE", `${activationScore.toFixed(1)}%`)}
    ${renderKpiCard(
      "TOP SPONSOR CATEGORIES",
      topCategories.length
        ? topCategories
            .map((item) => `<span>${item.category} (${item.count})</span>`)
            .join("<br />")
        : "No data"
    )}
    ${renderKpiCard("AVG OPPORTUNITIES / TEAM", opportunitiesPerTeam.toFixed(1))}
  `;
}

function renderKpiCard(label, value) {
  return `
    <div class="kpi-card">
      <span class="kpi-label">${label}</span>
      <div class="kpi-value">${value}</div>
    </div>
  `;
}

function summariseCategories(rows) {
  const counter = new Map();
  rows.forEach((row) => {
    const current = counter.get(row.category) ?? 0;
    counter.set(row.category, current + 1);
  });
  return Array.from(counter.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

function renderActiveFilterChips() {
  const container = document.getElementById("active-filter-chips");
  if (!container) {
    return;
  }
  const chips = [];

  if (state.teams.size) {
    const labels = Array.from(state.teams).map((id) => store.derived.teamMap.get(id)?.name ?? id);
    chips.push(createChipMarkup("Teams", labels.join(", "), () => {
      state.teams.clear();
      syncCheckboxGroup("team-filter-options", state.teams);
      render();
      syncURL();
    }));
  }
  if (state.sponsorNames.size) {
    chips.push(createChipMarkup("Sponsors", Array.from(state.sponsorNames).join(", "), () => {
      state.sponsorNames.clear();
      syncCheckboxGroup("sponsor-name-options", state.sponsorNames);
      render();
      syncURL();
    }));
  }
  if (state.sponsorCategories.size) {
    chips.push(createChipMarkup("Categories", Array.from(state.sponsorCategories).join(", "), () => {
      state.sponsorCategories.clear();
      syncCheckboxGroup("sponsor-category-options", state.sponsorCategories);
      render();
      syncURL();
    }));
  }
  if (state.inventoryTypes.size) {
    chips.push(createChipMarkup("Inventory", Array.from(state.inventoryTypes).join(", "), () => {
      state.inventoryTypes.clear();
      syncCheckboxGroup("inventory-type-options", state.inventoryTypes);
      render();
      syncURL();
    }));
  }
  if (state.activationChannels.size) {
    chips.push(createChipMarkup("Channel", Array.from(state.activationChannels).join(", "), () => {
      state.activationChannels.clear();
      syncCheckboxGroup("activation-channel-options", state.activationChannels);
      render();
      syncURL();
    }));
  }
  if (state.activationFormats.size) {
    chips.push(createChipMarkup("Format", Array.from(state.activationFormats).join(", "), () => {
      state.activationFormats.clear();
      syncCheckboxGroup("activation-format-options", state.activationFormats);
      render();
      syncURL();
    }));
  }
  if (state.interactivityLevels.size) {
    chips.push(createChipMarkup("Interactivity", Array.from(state.interactivityLevels).join(", "), () => {
      state.interactivityLevels.clear();
      syncCheckboxGroup("interactivity-options", state.interactivityLevels);
      render();
      syncURL();
    }));
  }
  if (state.opportunityTypes.size) {
    chips.push(createChipMarkup("Opportunities", Array.from(state.opportunityTypes).join(", "), () => {
      state.opportunityTypes.clear();
      syncCheckboxGroup("opportunity-type-options", state.opportunityTypes);
      render();
      syncURL();
    }));
  }
  if (state.opportunitySeverity.size) {
    chips.push(createChipMarkup("Severity", Array.from(state.opportunitySeverity).join(", "), () => {
      state.opportunitySeverity.clear();
      syncCheckboxGroup("opportunity-severity-options", state.opportunitySeverity);
      render();
      syncURL();
    }));
  }
  if (state.featureCategories.size) {
    chips.push(createChipMarkup("Feature category", Array.from(state.featureCategories).join(", "), () => {
      state.featureCategories.clear();
      syncCheckboxGroup("feature-category-options", state.featureCategories);
      render();
      syncURL();
    }));
  }
  if (state.featureSubfeatures.size) {
    chips.push(createChipMarkup("Sub-features", Array.from(state.featureSubfeatures).join(", "), () => {
      state.featureSubfeatures.clear();
      syncCheckboxGroup("feature-subfeature-options", state.featureSubfeatures);
      render();
      syncURL();
    }));
  }
  if (state.hasInApp) {
    chips.push(createChipMarkup("Has in-app", "Yes", () => {
      state.hasInApp = false;
      document.getElementById("has-in-app-toggle").checked = false;
      render();
      syncURL();
    }));
  }
  if (state.hasLoyalty) {
    chips.push(createChipMarkup("Has loyalty", "Yes", () => {
      state.hasLoyalty = false;
      document.getElementById("has-loyalty-toggle").checked = false;
      render();
      syncURL();
    }));
  }
  if (state.hasCommerce) {
    chips.push(createChipMarkup("Has commerce", "Yes", () => {
      state.hasCommerce = false;
      document.getElementById("has-commerce-toggle").checked = false;
      render();
      syncURL();
    }));
  }
  if (state.showGapsOnly) {
    chips.push(createChipMarkup("Gaps only", "On", () => {
      state.showGapsOnly = false;
      document.getElementById("show-gaps-toggle").checked = false;
      render();
      syncURL();
    }));
  }
  if (state.quickFilters.size) {
    chips.push(createChipMarkup("Quick filters", Array.from(state.quickFilters).join(", "), () => {
      state.quickFilters.clear();
      hydrateQuickFilters();
      applyQuickFilterEffects();
      render();
      syncURL();
    }));
  }

  if (!chips.length) {
    container.classList.add("filter-chips-empty");
    container.innerHTML = "";
  } else {
    container.classList.remove("filter-chips-empty");
    container.innerHTML = chips.join("");
  }
}

function createChipMarkup(label, value, onRemove) {
  const id = Math.random().toString(36).slice(2, 9);
  queueMicrotask(() => {
    const button = document.querySelector(`[data-chip-target="${id}"]`);
    if (button) {
      button.addEventListener("click", onRemove);
    }
  });
  return `
    <span class="filter-chip">${label}: <span>${value}</span>
      <button type="button" aria-label="Remove ${label}" data-chip-target="${id}">&times;</button>
    </span>
  `;
}

function renderView(filtered) {
  if (state.view === "teams") {
    renderTeamsView(filtered.teams);
  } else if (state.view === "sponsors") {
    renderSponsorsView(filtered);
  } else if (state.view === "activations") {
    renderActivationsView(filtered.activations);
  } else if (state.view === "opportunities") {
    renderOpportunitiesView(filtered);
  } else if (state.view === "features") {
    renderFeatureView(filtered.featureCoverage);
  }
}



function renderMode2() {
  const leagueSelect = document.getElementById("mode2-league-select");
  if (leagueSelect && store.mode2.leagues.length) {
    const options = store.mode2.leagues
      .map((league) => `<option value="${league.id}">${league.name}</option>`)
      .join("");
    leagueSelect.innerHTML = options;
    if (!store.mode2.leagues.some((league) => league.id === state.mode2League)) {
      state.mode2League = store.mode2.leagues[0].id;
    }
    leagueSelect.value = state.mode2League;
  }

  const teamSelect = document.getElementById("mode2-team-select");
  if (teamSelect) {
    populateMode2TeamOptions(teamSelect);
  }

  const emptyState = document.getElementById("mode2-empty-state");
  const tableWrapper = document.getElementById("mode2-table-wrapper");
  const tableBody = document.getElementById("mode2-table-body");
  if (!emptyState || !tableWrapper || !tableBody) {
    return;
  }

  if (!state.mode2Team) {
    emptyState.hidden = false;
    tableWrapper.hidden = true;
    tableBody.innerHTML = "";
    return;
  }

  const team = store.mode2.teamMap.get(state.mode2Team);
  if (!team) {
    emptyState.hidden = false;
    emptyState.innerHTML = '<h3>Team not found</h3><p>The selected team was not found in the sponsor dataset.</p>';
    tableWrapper.hidden = true;
    tableBody.innerHTML = "";
    return;
  }

  emptyState.hidden = true;
  tableWrapper.hidden = false;
  emptyState.innerHTML = '<h3>No team selected</h3><p>Choose a club to explore its sponsor inventory and activation notes.</p>';

  if (!team.activations || !team.activations.length) {
    tableBody.innerHTML = '<tr><td colspan="4">No sponsor activations recorded for this team.</td></tr>';
    return;
  }

  tableBody.innerHTML = team.activations
    .map(
      (activation) => `
        <tr>
          <td>${activation.sponsor || '—'}</td>
          <td>${activation.where_how || '—'}</td>
          <td>${activation.category || '—'}</td>
          <td>${activation.notes || '—'}</td>
        </tr>
      `
    )
    .join('');
}
function renderTeamsView(teams) {
  const grid = document.getElementById("team-grid");
  if (!grid) {
    return;
  }
  if (!teams.length) {
    grid.innerHTML = `<div class="placeholder"><h3>No teams match the current filters.</h3><p>Try clearing filters to see more results.</p></div>`;
    renderCompareBar();
    return;
  }

  grid.innerHTML = teams
    .map((team) => renderTeamCard(team))
    .join("");

  grid.querySelectorAll("[data-team-drawer]").forEach((button) => {
    button.addEventListener("click", () => openTeamDrawer(button.dataset.teamDrawer));
  });

  grid.querySelectorAll("[data-team-compare]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => toggleCompareSelection(checkbox.dataset.teamCompare, checkbox.checked));
    checkbox.checked = state.compareSelection.has(checkbox.dataset.teamCompare);
  });

  renderCompareBar();
}

function renderTeamCard(team) {
  const categoryMix = team.category_mix;
  const donutStyle = buildDonutStyle(categoryMix);
  const topCategories = categoryMix.slice(0, 3);
  const opportunities = team.opportunities.slice(0, 2);
  const activationScore = (team.totals.activation_score * 100).toFixed(1);

  return `
    <article class="team-card">
      <div class="team-card-header">
        <div>
          <h2 class="team-name">${team.name}</h2>
          <span class="client-badge ${team.is_yinzcam ? "yinzcam" : "non"}">${team.is_yinzcam ? "YinzCam" : "Non-YinzCam"}</span>
        </div>
        <button class="btn ghost" type="button" data-team-drawer="${team.id}">Open sponsorship table</button>
      </div>
      <div class="team-card-body">
        <div class="donut-wrapper">
          <div class="donut-chart" style="background:${donutStyle}">
            <div class="donut-center">${team.totals.sponsors}<br /><small>Sponsors</small></div>
          </div>
          <div class="donut-legend">
            ${topCategories
              .map(
                (item, index) => `
                  <div class="legend-item">
                    <span class="legend-swatch" style="background:${legendColor(index)}"></span>
                    <span>${item.category} (${item.count})</span>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="stat-block">
          <span class="stat-label">Activation score</span>
          <div class="stat-value">${activationScore}% <span>${team.totals.in_app_activations} in-app</span></div>
          <span class="stat-label">Opportunities</span>
          <div class="stat-value">${team.totals.opportunities}</div>
        </div>
        <div class="opportunity-pills">
          ${
            opportunities.length
              ? opportunities
                  .map(
                    (opp) => `
                        <div class="opportunity-pill">
                          <div class="opportunity-heading">
                            <span>${opp.type}</span>
                            <span>${opp.severity}</span>
                          </div>
                          <p>${opp.summary || "No summary"}</p>
                        </div>
                      `
                  )
                  .join("")
              : `<div class="opportunity-pill"><p>No explicit gaps captured yet.</p></div>`
          }
        </div>
      </div>
      <div class="card-actions">
        <label class="compare-checkbox">
          <input type="checkbox" data-team-compare="${team.id}" />
          <span>Select for compare</span>
        </label>
        <button class="btn ghost" type="button" data-team-drawer="${team.id}">Export &amp; view detail</button>
      </div>
    </article>
  `;
}

function buildDonutStyle(categoryMix) {
  const total = categoryMix.reduce((sum, item) => sum + item.count, 0) || 1;
  let currentAngle = 0;
  const segments = categoryMix.slice(0, 4).map((item, index) => {
    const angle = (item.count / total) * 360;
    const start = currentAngle;
    const end = currentAngle + angle;
    currentAngle = end;
    return `${legendColor(index)} ${start}deg ${end}deg`;
  });
  if (!segments.length) {
    segments.push("rgba(255, 255, 255, 0.2) 0deg 360deg");
  }
  return `conic-gradient(${segments.join(", ")})`;
}

function legendColor(index) {
  const palette = ["#ffd300", "#49e3a5", "#6c7bff", "#f38fff"];
  return palette[index % palette.length];
}

function toggleCompareSelection(teamId, checked) {
  if (checked) {
    state.compareSelection.add(teamId);
  } else {
    state.compareSelection.delete(teamId);
  }
  renderCompareBar();
}

function renderCompareBar() {
  const bar = document.getElementById("compare-bar");
  const compareText = document.getElementById("compare-text");
  const compareButton = document.getElementById("open-compare");
  if (!bar || !compareText || !compareButton) {
    return;
  }
  const count = state.compareSelection.size;
  if (!count) {
    bar.hidden = true;
    compareButton.disabled = true;
    return;
  }
  bar.hidden = false;
  compareText.textContent = `Compare ${count} team${count > 1 ? "s" : ""}`;
  compareButton.disabled = count < 2;
}

function openTeamDrawer(teamId) {
  const team = store.derived.teamMap.get(teamId);
  if (!team) {
    return;
  }
  const drawer = document.getElementById("team-drawer");
  const title = document.getElementById("drawer-team-name");
  const body = document.getElementById("drawer-body");
  if (!drawer || !title || !body) {
    return;
  }
  drawer.dataset.teamId = teamId;
  title.textContent = team.name;
  body.innerHTML = renderTeamDrawerContent(team);
  openDrawer(drawer.id);
}

function renderTeamDrawerContent(team) {
  const rows = team.sponsors
    .map(
      (row) => `
        <tr>
          <td>${row.sponsor}</td>
          <td>${row.where_how || "—"}</td>
          <td>${row.category}</td>
          <td>${row.channel}</td>
          <td>${row.format}</td>
          <td>${row.inventory_type}</td>
          <td>${row.notes || "—"}</td>
        </tr>
      `
    )
    .join("");

  const opportunities = team.opportunities
    .map(
      (opp) => `
        <li>
          <strong>${opp.type} (${opp.severity})</strong>
          <p>${opp.summary || "No summary"}</p>
          <p><em>${opp.recommendation || ""}</em></p>
        </li>
      `
    )
    .join("");

  const activations = team.observed_activations
    .map((activation) => `
      <li><strong>${activation.format || "Activation"}</strong> — ${activation.example || ""}<br /><span>${activation.notes || ""}</span></li>
    `)
    .join("");

  return `
    <div>
      <h3>Sponsorship table</h3>
      <div class="table-wrapper">
        <table class="drawer-table">
          <thead>
            <tr>
              <th>Sponsor</th>
              <th>Where / How</th>
              <th>Category</th>
              <th>Channel</th>
              <th>Format</th>
              <th>Inventory</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <div>
      <h3>Opportunities</h3>
      <ul>${opportunities || "<li>No opportunities recorded.</li>"}</ul>
    </div>
    <div>
      <h3>Observed activations</h3>
      <ul>${activations || "<li>No activations logged.</li>"}</ul>
    </div>
  `;
}

function openDrawer(id) {
  const drawer = document.getElementById(id);
  if (!drawer) {
    return;
  }
  drawer.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer(id) {
  const drawer = document.getElementById(id);
  if (!drawer) {
    return;
  }
  drawer.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
}

function openCompareDrawer() {
  const drawer = document.getElementById("compare-drawer");
  const body = document.getElementById("compare-body");
  const teams = Array.from(state.compareSelection)
    .map((id) => store.derived.teamMap.get(id))
    .filter(Boolean)
    .slice(0, 4);

  if (!drawer || !body) {
    return;
  }

  body.innerHTML = renderCompareContent(teams);
  openDrawer(drawer.id);
}

function renderCompareContent(teams) {
  if (!teams.length) {
    return `<p>No teams selected for comparison.</p>`;
  }
  const yinzcamTeams = store.teams.filter((team) => team.is_yinzcam);
  const medianActivationScore = median(yinzcamTeams.map((team) => team.totals.activation_score));
  const medianSponsors = median(yinzcamTeams.map((team) => team.totals.sponsors));
  const medianInApp = median(yinzcamTeams.map((team) => team.totals.in_app_activations));

  return `
    <div class="compare-grid" style="display:grid;grid-template-columns:repeat(${teams.length}, minmax(0,1fr));gap:1.4rem;">
      ${teams
        .map((team) => {
          const activationScore = (team.totals.activation_score * 100).toFixed(1);
          const deltaClass = !team.is_yinzcam && team.totals.activation_score < medianActivationScore ? "delta-negative" : "";
          return `
            <div class="compare-column" style="display:flex;flex-direction:column;gap:1rem;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:1.2rem;padding:1.1rem;">
              <header style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
                <h3 style="margin:0;">${team.name}</h3>
                <span class="client-badge ${team.is_yinzcam ? "yinzcam" : "non"}">${team.is_yinzcam ? "YinzCam" : "Non-YinzCam"}</span>
              </header>
              <section style="display:grid;gap:0.6rem;">
                <div><strong>Sponsors:</strong> ${team.totals.sponsors} ${deltaBadge(team, team.totals.sponsors, medianSponsors)}</div>
                <div><strong>In-app activations:</strong> ${team.totals.in_app_activations} ${deltaBadge(team, team.totals.in_app_activations, medianInApp)}</div>
                <div class="${deltaClass}"><strong>Activation score:</strong> ${activationScore}% ${deltaBadge(team, team.totals.activation_score, medianActivationScore, true)}</div>
              </section>
              <section>
                <h4 style="margin:0 0 0.35rem;">Category mix</h4>
                <div style="display:grid;gap:0.35rem;">
                  ${team.category_mix
                    .slice(0, 4)
                    .map(
                      (category) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
                          <span>${category.category}</span>
                          <span>${category.count}</span>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              </section>
              <section>
                <h4 style="margin:0 0 0.35rem;">Key activations</h4>
                <ul style="margin:0;padding-left:1.2rem;display:grid;gap:0.3rem;">
                  ${team.observed_activations
                    .map((activation) => `<li>${activation.example || activation.format}</li>`)
                    .join("") || "<li>No activations logged.</li>"}
                </ul>
              </section>
              <section>
                <h4 style="margin:0 0 0.35rem;">Opportunities</h4>
                <ul style="margin:0;padding-left:1.2rem;display:grid;gap:0.3rem;">
                  ${team.opportunities
                    .map((opp) => `<li>${opp.type} (${opp.severity}) – ${opp.summary || ""}</li>`)
                    .join("") || "<li>No gaps recorded.</li>"}
                </ul>
              </section>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function deltaBadge(team, value, baseline, isPercentage = false) {
  if (team.is_yinzcam || baseline === undefined || baseline === null) {
    return "";
  }
  const numericValue = isPercentage ? value * 100 : value;
  const numericBaseline = isPercentage ? baseline * 100 : baseline;
  const delta = numericValue - numericBaseline;
  if (Math.abs(delta) < 0.01) {
    return "";
  }
  const formatted = `${delta > 0 ? "+" : ""}${delta.toFixed(isPercentage ? 1 : 0)}${isPercentage ? "%" : ""}`;
  const tone = delta >= 0 ? "positive" : "negative";
  return `<span class="delta delta-${tone}">${formatted} vs YinzCam median</span>`;
}

function renderSponsorsView(filtered) {
  const accordion = document.getElementById("sponsor-accordion");
  if (!accordion) {
    return;
  }
  const distinctOnly = state.distinctSponsorsOnly;
  const workingTeams = new Set(filtered.teams.map((team) => team.id));

  const sections = (store.sponsors.by_category ?? []).map((category) => {
    const sponsors = category.sponsors.filter((sponsor) => {
      const intersects = sponsor.team_ids.some((id) => workingTeams.has(id));
      if (!intersects) {
        return false;
      }
      if (distinctOnly && sponsor.team_count > 1) {
        return false;
      }
      if (state.hasInApp && !sponsor.in_app_activations) {
        return false;
      }
      return true;
    });

    if (!sponsors.length) {
      return "";
    }

    return `
      <article class="accordion-item">
        <button class="accordion-header" type="button" aria-expanded="false" data-accordion-toggle>
          <span>${category.category}</span>
          <span>${sponsors.length}</span>
        </button>
        <div class="accordion-body" hidden>
          ${sponsors
            .map(
              (sponsor) => `
                <div class="sponsor-row">
                  <div>
                    <strong>${sponsor.name}</strong>
                    <p>${sponsor.team_count} teams</p>
                  </div>
                  <div>
                    <p>In-app activations: ${sponsor.in_app_activations}</p>
                    <p>Total activations: ${sponsor.total_activations}</p>
                  </div>
                  <div class="tag-group">
                    ${sponsor.teams.map((team) => `<span class="tag">${team}</span>`).join("")}
                  </div>
                  <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                    <button class="btn ghost" type="button" data-sponsor-detail="${sponsor.name}">View detail</button>
                    <button class="btn ghost" type="button" data-sponsor-filter="${sponsor.name}">Filter</button>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </article>
    `;
  });

  const markup = sections.filter(Boolean).join("") || "<div class=\"placeholder\"><p>No sponsors match the current filters.</p></div>";
  accordion.innerHTML = markup;

  accordion.querySelectorAll("[data-accordion-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      const body = button.nextElementSibling;
      button.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (body) {
        body.hidden = expanded;
      }
    });
  });

  accordion.querySelectorAll("[data-sponsor-detail]").forEach((button) => {
    button.addEventListener("click", () => openSponsorDrawer(button.dataset.sponsorDetail));
  });

  accordion.querySelectorAll("[data-sponsor-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const sponsorName = button.dataset.sponsorFilter;
      if (!sponsorName) {
        return;
      }
      state.sponsorNames.add(sponsorName);
      syncCheckboxGroup("sponsor-name-options", state.sponsorNames);
      render();
      syncURL();
    });
  });
}

function openSponsorDrawer(name) {
  const drawer = document.getElementById("sponsor-drawer");
  const title = document.getElementById("sponsor-drawer-title");
  const body = document.getElementById("sponsor-drawer-body");
  if (!drawer || !title || !body) {
    return;
  }
  const sponsor = (store.sponsors.details ?? []).find((item) => item.name === name);
  if (!sponsor) {
    showToast("Sponsor data unavailable");
    return;
  }
  title.textContent = sponsor.name;
  body.innerHTML = `
    <p><strong>Category:</strong> ${sponsor.category}</p>
    <p><strong>Teams:</strong> ${sponsor.teams.join(", ")}</p>
    <div class="table-wrapper">
      <table class="drawer-table">
        <thead>
          <tr>
            <th>Team</th>
            <th>Where / How</th>
            <th>Channel</th>
            <th>Format</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${sponsor.rows
            .map(
              (row) => `
                <tr>
                  <td>${row.team_name}</td>
                  <td>${row.where_how || "—"}</td>
                  <td>${row.channel}</td>
                  <td>${row.format}</td>
                  <td>${row.notes || "—"}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
  openDrawer(drawer.id);
}

function renderActivationsView(activations) {
  const tbody = document.getElementById("activations-tbody");
  const countEl = document.getElementById("activations-count");
  if (!tbody || !countEl) {
    return;
  }
  if (!activations.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">No activations found. Adjust filters to see results.</td>
      </tr>
    `;
    countEl.textContent = "0 rows";
    return;
  }

  tbody.innerHTML = activations
    .map((row) => {
      const yinzcamLabel = store.derived.teamMap.get(row.team_id)?.is_yinzcam ? "Yes" : "No";
      return `
        <tr>
          <td>${row.team_name}</td>
          <td>${row.sponsor}</td>
          <td>${row.channel}</td>
          <td>${row.format}</td>
          <td>${row.where_how || "—"}</td>
          <td>${row.category}</td>
          <td>${yinzcamLabel}</td>
          <td>${row.notes || "—"}</td>
        </tr>
      `;
    })
    .join("");
  countEl.textContent = `${activations.length} row${activations.length === 1 ? "" : "s"}`;
}

function renderOpportunitiesView(filtered) {
  const matrixContainer = document.getElementById("opportunity-matrix");
  const listContainer = document.getElementById("opportunity-list");
  if (!matrixContainer || !listContainer) {
    return;
  }
  const columns = ["Team", "Loyalty", "Gamification", "Data/Viz", "Venue-link", "Wellness/Health", "Commerce/Shoppable"];

  const rows = filtered.teams.map((team) => {
    const matrixRow = store.opportunities.matrix?.[team.id] ?? {};
    return `
      <div class="matrix-row">
        ${columns
          .map((column, index) => {
            if (index === 0) {
              return `<span class="matrix-header">${team.name}</span>`;
            }
            const severity = matrixRow[column] ?? "None";
            const classes = severity.toLowerCase();
            return `<span class="matrix-badge ${classes}">${severity}</span>`;
          })
          .join("")}
      </div>
    `;
  });

  matrixContainer.innerHTML = `
    <div class="matrix-row">
      ${columns.map((column) => `<span class="matrix-header">${column}</span>`).join("")}
    </div>
    ${rows.join("")}
  `;

  if (!filtered.opportunities.length) {
    listContainer.innerHTML = "<li>No opportunities surfaced.</li>";
    return;
  }

  listContainer.innerHTML = filtered.opportunities
    .map(
      (opp) => `
        <li class="opportunity-item">
          <header>
            <span>${opp.team_name}</span>
            <span>${opp.type} · ${opp.severity}</span>
          </header>
          <p>${opp.summary || "No description"}</p>
          ${opp.recommendation ? `<p><em>${opp.recommendation}</em></p>` : ""}
        </li>
      `
    )
    .join("");
}

function renderFeatureView(featureCoverage) {
  const heatmap = document.getElementById("feature-heatmap");
  const bars = document.getElementById("coverage-bars");
  if (!heatmap || !bars) {
    return;
  }
  const taxonomy = featureCoverage.taxonomy ?? {};
  const labels = featureCoverage.labels ?? {};
  const rows = featureCoverage.rows ?? [];

  if (!rows.length) {
    heatmap.innerHTML = "<p>No feature coverage available.</p>";
    bars.innerHTML = "";
    return;
  }

  const headerRow = ["Feature"].concat(rows.map((row) => row.teamName));
  const heatmapRows = [];

  Object.entries(taxonomy).forEach(([key, features]) => {
    const label = labels[key] ?? key;
    heatmapRows.push(`<div class="matrix-header" style="grid-column:1 / -1;margin-top:1rem;">${label}</div>`);
    features.forEach((feature) => {
      heatmapRows.push(`
        <div class="heatmap-row">
          <span class="heatmap-cell">${feature}</span>
          ${rows
            .map((row) => {
              const status = row.coverage?.[feature] ?? "unknown";
              const classes = status === "present" ? "present" : status === "absent" ? "absent" : "";
              return `<span class="heatmap-cell ${classes}">${status}</span>`;
            })
            .join("")}
        </div>
      `);
    });
  });

  heatmap.innerHTML = `
    <div class="heatmap-row">
      ${headerRow.map((label) => `<span class="heatmap-cell">${label}</span>`).join("")}
    </div>
    ${heatmapRows.join("")}
  `;

  bars.innerHTML = rows
    .map((row) => {
      const total = Object.keys(row.coverage).length || 1;
      const present = Object.values(row.coverage).filter((status) => status === "present").length;
      const percent = Math.round((present / total) * 100);
      return `
        <li class="coverage-bar">
          <header>
            <span>${row.teamName}</span>
            <span>${percent}%</span>
          </header>
          <div class="coverage-bar-meter"><span style="width:${percent}%;"></span></div>
        </li>
      `;
    })
    .join("");
}

function exportTeamCSV() {
  const drawer = document.getElementById("team-drawer");
  if (!drawer) {
    return;
  }
  const teamId = drawer.dataset.teamId;
  const team = store.derived.teamMap.get(teamId);
  if (!team) {
    return;
  }
  const headers = ["Sponsor", "Where/How", "Category", "Channel", "Format", "Inventory", "Notes"];
  const rows = team.sponsors.map((row) => [row.sponsor, row.where_how, row.category, row.channel, row.format, row.inventory_type, row.notes]);
  const csv = buildCSV([headers, ...rows]);
  downloadBlob(csv, `${team.id}-sponsorships.csv`, "text/csv");
}

function exportActivationsCSV() {
  const filtered = computeFilteredData();
  const headers = ["Team", "Sponsor", "Channel", "Format", "Where/How", "Category", "YinzCam", "Notes"];
  const rows = filtered.activations.map((row) => [
    row.team_name,
    row.sponsor,
    row.channel,
    row.format,
    row.where_how,
    row.category,
    store.derived.teamMap.get(row.team_id)?.is_yinzcam ? "Yes" : "No",
    row.notes,
  ]);
  const csv = buildCSV([headers, ...rows]);
  downloadBlob(csv, "activations.csv", "text/csv");
}

function copyActivationsToClipboard() {
  const filtered = computeFilteredData();
  const headers = ["Team", "Sponsor", "Channel", "Format", "Where/How", "Category", "YinzCam", "Notes"];
  const rows = filtered.activations.map((row) => [
    row.team_name,
    row.sponsor,
    row.channel,
    row.format,
    row.where_how,
    row.category,
    store.derived.teamMap.get(row.team_id)?.is_yinzcam ? "Yes" : "No",
    row.notes,
  ]);
  const text = buildCSV([headers, ...rows]);
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("Table copied"))
    .catch(() => showToast("Copy failed"));
}

function exportOpportunitiesCSV() {
  const filtered = computeFilteredData();
  const headers = ["Team", "Type", "Severity", "Summary", "Recommendation"];
  const rows = filtered.opportunities.map((opp) => [opp.team_name, opp.type, opp.severity, opp.summary, opp.recommendation]);
  const csv = buildCSV([headers, ...rows]);
  downloadBlob(csv, "opportunities.csv", "text/csv");
}

function exportFeaturesCSV() {
  const filtered = computeFilteredData();
  const headers = ["Team", "Feature", "Status"];
  const rows = [];
  filtered.featureCoverage.rows.forEach((row) => {
    Object.entries(row.coverage).forEach(([feature, status]) => {
      rows.push([row.teamName, feature, status]);
    });
  });
  const csv = buildCSV([headers, ...rows]);
  downloadBlob(csv, "feature-coverage.csv", "text/csv");
}

function buildCSV(rows) {
  return rows
    .map((row) =>
      row
        .map((cell = "") => {
          const needsEscaping = typeof cell === "string" && (cell.includes(",") || cell.includes("\"") || /\s/.test(cell));
          const value = cell === undefined || cell === null ? "" : String(cell);
          return needsEscaping ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(",")
    )
    .join("\n");
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function handleSaveView() {
  const name = prompt("Name this view", `Saved view ${savedViews.length + 1}`);
  if (!name) {
    return;
  }
  const snapshot = serializeState();
  savedViews.push({ name, snapshot });
  try {
    window.localStorage.setItem("yinzfeed_saved_views", JSON.stringify(savedViews));
    showToast("View saved");
  } catch (error) {
    console.warn("Unable to persist saved view", error);
  }
}

function handleShareView() {
  const url = new URL(window.location.href);
  url.search = serializeState();
  navigator.clipboard
    .writeText(url.toString())
    .then(() => showToast("Sharable link copied"))
    .catch(() => showToast("Unable to copy link"));
}

function serializeState() {
  const params = new URLSearchParams();
  params.set("client", state.clientType);
  params.set("view", state.view);
  params.set("mode", state.mode);
  if (state.teams.size) params.set("teams", Array.from(state.teams).join("|"));
  if (state.sponsorNames.size) params.set("sponsors", Array.from(state.sponsorNames).join("|"));
  if (state.sponsorCategories.size) params.set("categories", Array.from(state.sponsorCategories).join("|"));
  if (state.inventoryTypes.size) params.set("inventory", Array.from(state.inventoryTypes).join("|"));
  if (state.activationChannels.size) params.set("channels", Array.from(state.activationChannels).join("|"));
  if (state.activationFormats.size) params.set("formats", Array.from(state.activationFormats).join("|"));
  if (state.interactivityLevels.size) params.set("interactivity", Array.from(state.interactivityLevels).join("|"));
  if (state.hasInApp) params.set("inapp", "1");
  if (state.hasLoyalty) params.set("loyalty", "1");
  if (state.hasCommerce) params.set("commerce", "1");
  if (state.distinctSponsorsOnly) params.set("distinct", "1");
  if (state.opportunityTypes.size) params.set("opptypes", Array.from(state.opportunityTypes).join("|"));
  if (state.opportunitySeverity.size) params.set("oppsev", Array.from(state.opportunitySeverity).join("|"));
  if (state.showGapsOnly) params.set("gaps", "1");
  if (state.featureCategories.size) params.set("featcat", Array.from(state.featureCategories).join("|"));
  if (state.featureSubfeatures.size) params.set("featsub", Array.from(state.featureSubfeatures).join("|"));
  if (state.coverageMode !== "all") params.set("covmode", state.coverageMode);
  if (state.quickFilters.size) params.set("quick", Array.from(state.quickFilters).join("|"));
  if (state.compareSelection.size) params.set("compare", Array.from(state.compareSelection).join("|"));
  if (state.mode2League) params.set("m2l", state.mode2League);
  if (state.mode2Team) params.set("m2t", state.mode2Team);
  if (state.sidebarCollapsed) params.set("sc", "1");
  return params.toString();
}

function loadStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (!params.size) {
    return;
  }
  state.clientType = params.get("client") ?? state.clientType;
  state.view = params.get("view") ?? state.view;
  state.mode = params.get("mode") ?? state.mode;
  parseSetParam(params.get("teams"), state.teams);
  parseSetParam(params.get("sponsors"), state.sponsorNames);
  parseSetParam(params.get("categories"), state.sponsorCategories);
  parseSetParam(params.get("inventory"), state.inventoryTypes);
  parseSetParam(params.get("channels"), state.activationChannels);
  parseSetParam(params.get("formats"), state.activationFormats);
  parseSetParam(params.get("interactivity"), state.interactivityLevels);
  state.hasInApp = params.get("inapp") === "1";
  state.hasLoyalty = params.get("loyalty") === "1";
  state.hasCommerce = params.get("commerce") === "1";
  state.distinctSponsorsOnly = params.get("distinct") === "1";
  parseSetParam(params.get("opptypes"), state.opportunityTypes);
  parseSetParam(params.get("oppsev"), state.opportunitySeverity);
  state.showGapsOnly = params.get("gaps") === "1";
  parseSetParam(params.get("featcat"), state.featureCategories);
  parseSetParam(params.get("featsub"), state.featureSubfeatures);
  state.coverageMode = params.get("covmode") ?? state.coverageMode;
  parseSetParam(params.get("quick"), state.quickFilters);
  parseSetParam(params.get("compare"), state.compareSelection);
  state.mode2League = params.get("m2l") ?? state.mode2League;
  state.mode2Team = params.get("m2t") ?? state.mode2Team;
  state.sidebarCollapsed = params.get("sc") === "1";

  document.getElementById("distinct-sponsor-toggle").checked = state.distinctSponsorsOnly;
  document.getElementById("has-in-app-toggle").checked = state.hasInApp;
  document.getElementById("has-loyalty-toggle").checked = state.hasLoyalty;
  document.getElementById("has-commerce-toggle").checked = state.hasCommerce;
  document.getElementById("show-gaps-toggle").checked = state.showGapsOnly;

  hydrateQuickFilters();
  applyQuickFilterEffects();
  syncCheckboxGroup("team-filter-options", state.teams);
  syncCheckboxGroup("sponsor-name-options", state.sponsorNames);
  syncCheckboxGroup("sponsor-category-options", state.sponsorCategories);
  syncCheckboxGroup("inventory-type-options", state.inventoryTypes);
  syncCheckboxGroup("activation-channel-options", state.activationChannels);
  syncCheckboxGroup("activation-format-options", state.activationFormats);
  syncCheckboxGroup("interactivity-options", state.interactivityLevels);
  syncCheckboxGroup("opportunity-type-options", state.opportunityTypes);
  syncCheckboxGroup("opportunity-severity-options", state.opportunitySeverity);
  syncCheckboxGroup("feature-category-options", state.featureCategories);
  syncCheckboxGroup("feature-subfeature-options", state.featureSubfeatures);

  const leagueSelect = document.getElementById("mode2-league-select");
  if (leagueSelect) {
    leagueSelect.value = state.mode2League;
  }
  const teamSelect = document.getElementById("mode2-team-select");
  if (teamSelect) {
    populateMode2TeamOptions(teamSelect);
  }

  document.querySelectorAll(".switcher-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.view !== state.view);
  });
  document.querySelectorAll(".mode-switch .btn.toggle").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });
  document.querySelectorAll(".dashboard").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.mode !== state.mode);
  });

  applySidebarState();
}

function parseSetParam(value, targetSet) {
  targetSet.clear();
  if (!value) {
    return;
  }
  value.split("|").forEach((item) => targetSet.add(item));
}

function syncURL() {
  const query = serializeState();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
  window.history.replaceState(null, "", url);
}

let toastTimeout;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function median(values) {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  const length = sorted.length;
  if (!length) {
    return 0;
  }
  const mid = Math.floor(length / 2);
  if (length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function percentage(part, total) {
  if (!total) {
    return "0%";
  }
  return `${((part / total) * 100).toFixed(1)}%`;
}
