// Global Data
let tournamentData = null;
let userPredictions = {
  matches: {}, // matchId -> { homeScore, awayScore, risk, goal, homeScorer, awayScorer }
  groups: {},  // groupLetter -> [team1, team2, team3, team4]
  knockout: {
    r32: [],
    r16: [],
    qf: [],
    sf: [],
    tf: [],
    finalists: [],
    champion: "",
    thirdPlace: ""
  },
  trivia: {
    yellowCard: null,
    redCard: null,
    firstGoal: null,
    topscorer: ""
  }
};

let adminOverrides = {
  matches: {}, // matchId -> { homeScore, awayScore, homeScorer, awayScorer }
  stats: {
    first_yellow_card_minute: null,
    first_red_card_minute: null,
    first_goal_minute: null,
    first_goal_scorer: null,
    topscorer: null,
    group_standings: {},
    knockout: {
      round_of_32: [],
      round_of_16: [],
      quarter_finals: [],
      semi_finals: [],
      third_place_match: [],
      finalists: [],
      champion: "",
      third_place: ""
    }
  }
};

// Constant Flag Mapping
const flagMap = {
  "mexico": "mx", "south africa": "za", "south korea": "kr", "czechia": "cz",
  "canada": "ca", "bosnia and herzegovina": "ba", "qatar": "qa", "switzerland": "ch",
  "brazil": "br", "morocco": "ma", "haiti": "ht", "scotland": "gb-sct",
  "united states": "us", "paraguay": "py", "australia": "au", "turkey": "tr",
  "germany": "de", "curacao": "cw", "ivory coast": "ci", "ecuador": "ec",
  "netherlands": "nl", "japan": "jp", "sweden": "se", "tunisia": "tn",
  "belgium": "be", "egypt": "eg", "iran": "ir", "new zealand": "nz",
  "spain": "es", "cape verde": "cv", "saudi arabia": "sa", "uruguay": "uy",
  "france": "fr", "senegal": "sn", "iraq": "iq", "norway": "no",
  "argentina": "ar", "algeria": "dz", "austria": "at", "jordan": "jo",
  "portugal": "pt", "dr congo": "cd", "uzbekistan": "uz", "colombia": "co",
  "england": "gb-eng", "croatia": "hr", "ghana": "gh", "panama": "pa"
};

// Date when predictions for Tournament are frozen (June 11, 2026 18:00 UTC)
const TOURNAMENT_DEADLINE = new Date("2026-06-11T18:00:00Z");

// Initialization
document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  loadLocalStorage();
  await loadData();
  setupCountdown();
  setupFilters();
  setupAdminControls();
  renderAll();
});

// Load match and group data
async function loadData() {
  try {
    const response = await fetch("data/wc2026.json");
    if (response.ok) {
      tournamentData = await response.json();
    } else {
      throw new Error("Failed to load JSON");
    }
  } catch (err) {
    console.warn("Could not load tournament json, using client fallbacks", err);
    // Minimal fallback data structure if json fetch fails
    tournamentData = {
      matches: [],
      stats: {
        first_yellow_card_minute: null,
        first_red_card_minute: null,
        first_goal_minute: null,
        first_goal_scorer: null,
        topscorer: null,
        group_standings: {},
        knockout: {
          round_of_32: [],
          round_of_16: [],
          quarter_finals: [],
          semi_finals: [],
          third_place_match: [],
          finalists: [],
          champion: "",
          third_place: ""
        }
      }
    };
  }

  // Populate default group predictions if empty
  const groupsDefinition = {
    "A": ["Mexico", "South Africa", "South Korea", "Czechia"],
    "B": ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
    "C": ["Brazil", "Morocco", "Haiti", "Scotland"],
    "D": ["United States", "Paraguay", "Australia", "Turkey"],
    "E": ["Germany", "Curacao", "Ivory Coast", "Ecuador"],
    "F": ["Netherlands", "Japan", "Sweden", "Tunisia"],
    "G": ["Belgium", "Egypt", "Iran", "New Zealand"],
    "H": ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
    "I": ["France", "Senegal", "Iraq", "Norway"],
    "J": ["Argentina", "Algeria", "Austria", "Jordan"],
    "K": ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
    "L": ["England", "Croatia", "Ghana", "Panama"]
  };

  for (const [group, teams] of Object.entries(groupsDefinition)) {
    if (!userPredictions.groups[group] || userPredictions.groups[group].length !== 4) {
      userPredictions.groups[group] = [...teams];
    }
    if (!adminOverrides.stats.group_standings[group]) {
      adminOverrides.stats.group_standings[group] = [];
    }
  }
}

// LocalStorage loaders/savers
function loadLocalStorage() {
  const pred = localStorage.getItem("wk_user_predictions");
  if (pred) {
    try {
      userPredictions = JSON.parse(pred);
      // Ensure structure exists
      if (!userPredictions.knockout) userPredictions.knockout = {};
      if (!userPredictions.trivia) userPredictions.trivia = {};
      if (!userPredictions.groups) userPredictions.groups = {};
    } catch(e) { console.error(e); }
  }

  const overrides = localStorage.getItem("wk_admin_overrides");
  if (overrides) {
    try {
      adminOverrides = JSON.parse(overrides);
      if (!adminOverrides.matches) adminOverrides.matches = {};
      if (!adminOverrides.stats) adminOverrides.stats = {};
      if (!adminOverrides.stats.knockout) adminOverrides.stats.knockout = {};
      if (!adminOverrides.stats.group_standings) adminOverrides.stats.group_standings = {};
    } catch(e) { console.error(e); }
  }
}

function savePredictions() {
  localStorage.setItem("wk_user_predictions", JSON.stringify(userPredictions));
  calculateScores();
}

function saveAdminOverrides() {
  localStorage.setItem("wk_admin_overrides", JSON.stringify(adminOverrides));
  calculateScores();
  showToast("Beheerder overrides opgeslagen!");
  renderAll();
}

// Navigation Tabs
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      
      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      document.getElementById(tabId).classList.add("active");
    });
  });
}

// Countdown Clock
let isDeadlinePassed = false;
function setupCountdown() {
  const counterText = document.getElementById("countdown-text");
  
  function updateTimer() {
    const now = new Date();
    const diff = TOURNAMENT_DEADLINE - now;
    
    if (diff <= 0) {
      counterText.textContent = "Toernooi Gestart!";
      isDeadlinePassed = true;
      clearInterval(timerInterval);
    } else {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      counterText.textContent = `Start in: ${days}d ${hours}u ${mins}m`;
      isDeadlinePassed = false;
    }
  }

  updateTimer();
  const timerInterval = setInterval(updateTimer, 60000);
}

// Get final state combining scraped JSON data + admin manual overrides
function getActualData() {
  const matches = (tournamentData?.matches || []).map(m => {
    const override = adminOverrides.matches[m.id];
    return {
      ...m,
      actual_score: override?.actual_score !== undefined ? override.actual_score : m.actual_score,
      home_first_scorer: override?.home_first_scorer !== undefined ? override.home_first_scorer : m.home_first_scorer,
      away_first_scorer: override?.away_first_scorer !== undefined ? override.away_first_scorer : m.away_first_scorer
    };
  });

  const stats = {
    first_yellow_card_minute: adminOverrides.stats.first_yellow_card_minute !== null ? adminOverrides.stats.first_yellow_card_minute : tournamentData?.stats?.first_yellow_card_minute,
    first_red_card_minute: adminOverrides.stats.first_red_card_minute !== null ? adminOverrides.stats.first_red_card_minute : tournamentData?.stats?.first_red_card_minute,
    first_goal_minute: adminOverrides.stats.first_goal_minute !== null ? adminOverrides.stats.first_goal_minute : tournamentData?.stats?.first_goal_minute,
    first_goal_scorer: adminOverrides.stats.first_goal_scorer !== null ? adminOverrides.stats.first_goal_scorer : tournamentData?.stats?.first_goal_scorer,
    topscorer: adminOverrides.stats.topscorer !== null ? adminOverrides.stats.topscorer : tournamentData?.stats?.topscorer,
    group_standings: {},
    knockout: {
      round_of_32: adminOverrides.stats.knockout?.round_of_32?.length ? adminOverrides.stats.knockout.round_of_32 : (tournamentData?.stats?.knockout?.round_of_32 || []),
      round_of_16: adminOverrides.stats.knockout?.round_of_16?.length ? adminOverrides.stats.knockout.round_of_16 : (tournamentData?.stats?.knockout?.round_of_16 || []),
      quarter_finals: adminOverrides.stats.knockout?.quarter_finals?.length ? adminOverrides.stats.knockout.quarter_finals : (tournamentData?.stats?.knockout?.quarter_finals || []),
      semi_finals: adminOverrides.stats.knockout?.semi_finals?.length ? adminOverrides.stats.knockout.semi_finals : (tournamentData?.stats?.knockout?.semi_finals || []),
      third_place_match: adminOverrides.stats.knockout?.third_place_match?.length ? adminOverrides.stats.knockout.third_place_match : (tournamentData?.stats?.knockout?.third_place_match || []),
      finalists: adminOverrides.stats.knockout?.finalists?.length ? adminOverrides.stats.knockout.finalists : (tournamentData?.stats?.knockout?.finalists || []),
      champion: adminOverrides.stats.knockout?.champion || tournamentData?.stats?.knockout?.champion,
      third_place: adminOverrides.stats.knockout?.third_place || tournamentData?.stats?.knockout?.third_place
    }
  };

  // Merge group standings overrides
  const groups = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  groups.forEach(g => {
    stats.group_standings[g] = adminOverrides.stats.group_standings[g]?.length === 4 
      ? adminOverrides.stats.group_standings[g] 
      : (tournamentData?.stats?.group_standings?.[g] || []);
  });

  return { matches, stats };
}

// Math Predictor: Poisson logic
function calculatePoissonPredictions(odds, riskFactor, goalFactor) {
  // 1. Odds to Implied Probabilities
  const impliedHome = 1 / (odds.home || 2.2);
  const impliedDraw = 1 / (odds.draw || 3.2);
  const impliedAway = 1 / (odds.away || 3.2);
  const sumImplied = impliedHome + impliedDraw + impliedAway;

  let pH = impliedHome / sumImplied;
  let pD = impliedDraw / sumImplied;
  let pA = impliedAway / sumImplied;

  // 2. Risk factor adjustment (-1 to 1)
  // Find Favorite (H vs A)
  if (pH !== pA) {
    const isHomeFav = pH > pA;
    const fav = isHomeFav ? "home" : "away";

    if (riskFactor < 0) {
      // Favor Favorite (Make risk factor negative, i.e., decrease underdog probability)
      const absRisk = Math.abs(riskFactor);
      if (fav === "home") {
        const transfer = pA * absRisk * 0.55;
        pH += transfer;
        pA -= transfer;
      } else {
        const transfer = pH * absRisk * 0.55;
        pA += transfer;
        pH -= transfer;
      }
    } else if (riskFactor > 0) {
      // Favor Underdog
      if (fav === "home") {
        const transfer = pH * riskFactor * 0.45;
        pH -= transfer;
        pA += transfer;
      } else {
        const transfer = pA * riskFactor * 0.45;
        pA -= transfer;
        pH += transfer;
      }
    }
    // Re-normalize
    const totalP = pH + pD + pA;
    pH /= totalP;
    pD /= totalP;
    pA /= totalP;
  }

  // 3. Goal factor adjustment
  const baseExpectedGoals = 2.6;
  // Goal Factor (-1 to 1) scales goals from 0.8 goals up to ~4.6 goals
  const expectedGoals = Math.max(0.5, baseExpectedGoals * (1 + 0.8 * goalFactor));

  // Distribute goals using outcome weights
  // Ratio of expected goals for home and away based on win probabilities
  const weightH = pH + 0.5 * pD;
  const weightA = pA + 0.5 * pD;
  const lambdaH = expectedGoals * (weightH / (weightH + weightA));
  const lambdaA = expectedGoals * (weightA / (weightH + weightA));

  // 4. Poisson probability calculation
  const poissonProb = (lambda, k) => {
    return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
  };

  const factorial = (n) => {
    if (n === 0 || n === 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
  };

  const scores = [];
  let sumRaw = 0;
  let wHomeRaw = 0, wDrawRaw = 0, wAwayRaw = 0;

  // Calculate raw scores from 0-0 to 5-5
  const rawMatrix = {};
  for (let h = 0; h <= 5; h++) {
    rawMatrix[h] = {};
    for (let a = 0; a <= 5; a++) {
      const pHomeGoal = poissonProb(lambdaH, h);
      const pAwayGoal = poissonProb(lambdaA, a);
      const prob = pHomeGoal * pAwayGoal;
      rawMatrix[h][a] = prob;
      sumRaw += prob;

      if (h > a) wHomeRaw += prob;
      else if (h === a) wDrawRaw += prob;
      else wAwayRaw += prob;
    }
  }

  // Adjust raw scores to match target outcomes (pH, pD, pA)
  let sumAdj = 0;
  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      let prob = rawMatrix[h][a];
      if (h > a && wHomeRaw > 0) prob *= (pH / wHomeRaw);
      else if (h === a && wDrawRaw > 0) prob *= (pD / wDrawRaw);
      else if (h < a && wAwayRaw > 0) prob *= (pA / wAwayRaw);

      rawMatrix[h][a] = prob;
      sumAdj += prob;
    }
  }

  // Normalize final adjusted probabilities
  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      const finalProb = rawMatrix[h][a] / sumAdj;
      scores.push({
        home: h,
        away: a,
        probability: finalProb
      });
    }
  }

  // Sort by probability descending and return top 3
  scores.sort((a, b) => b.probability - a.probability);
  return scores.slice(0, 3);
}

// Get CSS text display for slider values
function getRiskStatus(val) {
  if (val < -0.1) return `Favoriet (x${Math.abs(val).toFixed(1)})`;
  if (val > 0.1) return `Underdog (x${val.toFixed(1)})`;
  return "Neutraal (Boekmaker)";
}

function getGoalStatus(val) {
  if (val < -0.1) return `Defensief (${Math.abs(val).toFixed(1)})`;
  if (val > 0.1) return `Aanvallend (${val.toFixed(1)})`;
  return "Gemiddeld (2.6 goals)";
}

// Filters implementation
let searchQuery = "";
let selectedRound = "all";
function setupFilters() {
  document.getElementById("match-search").addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderMatches();
  });

  document.getElementById("match-round-filter").addEventListener("change", (e) => {
    selectedRound = e.target.value;
    renderMatches();
  });
}

// Render All Components
function renderAll() {
  renderMatches();
  renderTournamentGroups();
  renderKnockoutGrids();
  renderDashboard();
  renderAdminPanel();
}

// Render Matches List
function renderMatches() {
  const container = document.getElementById("matches-list-container");
  container.innerHTML = "";

  const actualData = getActualData();
  const list = actualData.matches;

  // Filter
  const filtered = list.filter(m => {
    const home = m.home_team.toLowerCase();
    const away = m.away_team.toLowerCase();
    const matchSearch = home.includes(searchQuery) || away.includes(searchQuery);

    let matchRound = true;
    if (selectedRound !== "all") {
      const stage = m.stage.toLowerCase();
      if (selectedRound === "groep") matchRound = stage.includes("groep");
      else if (selectedRound === "round of 32") matchRound = stage.includes("32") || stage.includes("16e");
      else if (selectedRound === "round of 16") matchRound = stage.includes("16") || stage.includes("8e");
      else if (selectedRound === "quarter") matchRound = stage.includes("kwart") || stage.includes("quarter");
      else if (selectedRound === "semi") matchRound = stage.includes("halve") || stage.includes("semi");
      else if (selectedRound === "final") matchRound = stage.includes("finale") || stage.includes("troost");
    }

    return matchSearch && matchRound;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="glass" style="padding: 2rem; text-align: center; color: var(--text-muted);">Geen wedstrijden gevonden.</div>`;
    return;
  }

  filtered.forEach(m => {
    // Get user prediction state or defaults
    if (!userPredictions.matches[m.id]) {
      userPredictions.matches[m.id] = { homeScore: "", awayScore: "", risk: 0, goal: 0, homeScorer: "", awayScorer: "" };
    }
    const pred = userPredictions.matches[m.id];
    
    // Check if match already started (freeze)
    const matchDate = new Date(m.date);
    const isFrozen = new Date() > matchDate;

    // Calculate live Poisson
    const top3 = calculatePoissonPredictions(m.odds, pred.risk, pred.goal);

    // Flag images
    const homeCode = flagMap[m.home_team.toLowerCase()] || "un";
    const awayCode = flagMap[m.away_team.toLowerCase()] || "un";

    // Card element
    const card = document.createElement("div");
    card.className = `glass match-card ${m.match_of_the_day ? 'motd' : ''}`;
    
    // Header
    let badgeHTML = m.match_of_the_day ? `<span class="motd-badge">Match of the Day</span>` : '';
    const formattedDate = matchDate.toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    
    // Show match details
    let scoreDisplayHTML = "";
    if (m.actual_score) {
      scoreDisplayHTML = `<span class="actual-score-badge">${m.actual_score.home} - ${m.actual_score.away}</span>`;
    } else {
      scoreDisplayHTML = `<span class="vs-text">VS</span>`;
    }

    card.innerHTML = `
      <div class="match-header">
        <span>${m.stage} &bull; ${formattedDate}</span>
        ${badgeHTML}
      </div>
      
      <div class="match-teams">
        <div class="team-display home">
          <span class="team-name">${m.home_team}</span>
          <img class="team-flag" src="https://flagcdn.com/w80/${homeCode}.png" alt="${m.home_team}">
        </div>
        
        <div class="match-vs-score">
          ${scoreDisplayHTML}
          <div class="prediction-inputs" style="margin-top: 0.5rem;">
            <input type="number" class="score-input home-input" min="0" max="9" value="${pred.homeScore}" placeholder="-" ${isFrozen ? 'disabled' : ''}>
            <span style="font-weight: 700;">-</span>
            <input type="number" class="score-input away-input" min="0" max="9" value="${pred.awayScore}" placeholder="-" ${isFrozen ? 'disabled' : ''}>
          </div>
        </div>

        <div class="team-display away">
          <img class="team-flag" src="https://flagcdn.com/w80/${awayCode}.png" alt="${m.away_team}">
          <span class="team-name">${m.away_team}</span>
        </div>
      </div>

      <div class="odds-display">
        <div class="odds-value">1: <span>${m.odds.home.toFixed(2)}</span></div>
        <div class="odds-value">X: <span>${m.odds.draw.toFixed(2)}</span></div>
        <div class="odds-value">2: <span>${m.odds.away.toFixed(2)}</span></div>
      </div>

      <!-- Live Poisson Slider Panel -->
      <div class="sliders-panel" style="${isFrozen ? 'opacity: 0.6; pointer-events: none;' : ''}">
        <div class="slider-group">
          <div class="slider-header">
            <span>Risicofactor</span>
            <span class="slider-status risk-status-label">${getRiskStatus(pred.risk)}</span>
          </div>
          <input type="range" class="range-slider risk-slider" min="-1" max="1" step="0.1" value="${pred.risk}">
        </div>
        
        <div class="slider-group">
          <div class="slider-header">
            <span>Goalfactor</span>
            <span class="slider-status goal-status-label">${getGoalStatus(pred.goal)}</span>
          </div>
          <input type="range" class="range-slider goal-slider" min="-1" max="1" step="0.1" value="${pred.goal}">
        </div>
      </div>

      <div class="top-predictions" style="${isFrozen ? 'display: none;' : ''}">
        <div class="top-predictions-title">Top 3 Berekende Uitslagen (Klik om te voorspellen):</div>
        <div class="top-btns-container">
          ${top3.map(score => `
            <button class="top-score-btn" data-h="${score.home}" data-a="${score.away}">
              ${score.home} - ${score.away} (${(score.probability * 100).toFixed(1)}%)
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Match of the day first scorers -->
      ${m.match_of_the_day ? `
        <div class="motd-scorers" style="${isFrozen ? 'opacity: 0.6; pointer-events: none;' : ''}">
          <div class="scorer-group">
            <label class="scorer-label">1e Doelpuntenmaker ${m.home_team}</label>
            <input type="text" class="scorer-input home-scorer" value="${pred.homeScorer || ''}" placeholder="Naam speler..." ${isFrozen ? 'disabled' : ''}>
          </div>
          <div class="scorer-group">
            <label class="scorer-label">1e Doelpuntenmaker ${m.away_team}</label>
            <input type="text" class="scorer-input away-scorer" value="${pred.awayScorer || ''}" placeholder="Naam speler..." ${isFrozen ? 'disabled' : ''}>
          </div>
        </div>
      ` : ''}
    `;

    // Hook inputs & sliders events
    const homeInput = card.querySelector(".home-input");
    const awayInput = card.querySelector(".away-input");
    const riskSlider = card.querySelector(".risk-slider");
    const goalSlider = card.querySelector(".goal-slider");
    
    const saveMatchPred = () => {
      pred.homeScore = homeInput.value !== "" ? parseInt(homeInput.value) : "";
      pred.awayScore = awayInput.value !== "" ? parseInt(awayInput.value) : "";
      savePredictions();
    };

    homeInput.addEventListener("change", saveMatchPred);
    awayInput.addEventListener("change", saveMatchPred);

    if (m.match_of_the_day) {
      const homeScorerInput = card.querySelector(".home-scorer");
      const awayScorerInput = card.querySelector(".away-scorer");
      
      const saveScorers = () => {
        pred.homeScorer = homeScorerInput.value.trim();
        pred.awayScorer = awayScorerInput.value.trim();
        savePredictions();
      };
      
      homeScorerInput.addEventListener("change", saveScorers);
      awayScorerInput.addEventListener("change", saveScorers);
    }

    // Sliders dynamic calculation
    riskSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      pred.risk = val;
      card.querySelector(".risk-status-label").textContent = getRiskStatus(val);
      
      // Recalculate top 3 live
      const newTop3 = calculatePoissonPredictions(m.odds, pred.risk, pred.goal);
      const topContainer = card.querySelector(".top-btns-container");
      topContainer.innerHTML = newTop3.map(score => `
        <button class="top-score-btn" data-h="${score.home}" data-a="${score.away}">
          ${score.home} - ${score.away} (${(score.probability * 100).toFixed(1)}%)
        </button>
      `).join('');
      setupTopBtns(card, homeInput, awayInput, saveMatchPred);
      savePredictions();
    });

    goalSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      pred.goal = val;
      card.querySelector(".goal-status-label").textContent = getGoalStatus(val);
      
      // Recalculate top 3 live
      const newTop3 = calculatePoissonPredictions(m.odds, pred.risk, pred.goal);
      const topContainer = card.querySelector(".top-btns-container");
      topContainer.innerHTML = newTop3.map(score => `
        <button class="top-score-btn" data-h="${score.home}" data-a="${score.away}">
          ${score.home} - ${score.away} (${(score.probability * 100).toFixed(1)}%)
        </button>
      `).join('');
      setupTopBtns(card, homeInput, awayInput, saveMatchPred);
      savePredictions();
    });

    setupTopBtns(card, homeInput, awayInput, saveMatchPred);

    container.appendChild(card);
  });
}

function setupTopBtns(card, homeInput, awayInput, saveMatchPred) {
  card.querySelectorAll(".top-score-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      homeInput.value = btn.getAttribute("data-h");
      awayInput.value = btn.getAttribute("data-a");
      saveMatchPred();
    });
  });
}

// Render Tournament tab groups (Standings)
function renderTournamentGroups() {
  const container = document.getElementById("group-standings-container");
  container.innerHTML = "";

  const groups = Object.keys(userPredictions.groups).sort();
  groups.forEach(letter => {
    const teams = userPredictions.groups[letter];
    const card = document.createElement("div");
    card.className = "glass group-card";
    
    card.innerHTML = `
      <div class="group-header">Groep ${letter}</div>
      <div class="group-team-list" id="group-${letter}-list">
        ${teams.map((team, idx) => {
          const code = flagMap[team.toLowerCase()] || "un";
          return `
            <div class="group-team-item" data-team="${team}">
              <div class="rank-team-info">
                <span class="team-rank">${idx + 1}</span>
                <img class="team-flag" style="width:25px; height:18px;" src="https://flagcdn.com/w40/${code}.png" alt="${team}">
                <span class="rank-team-name">${team}</span>
              </div>
              <div class="rank-controls" style="${isDeadlinePassed ? 'display: none;' : ''}">
                <button class="rank-btn up-btn">&uarr;</button>
                <button class="rank-btn down-btn">&darr;</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Rank click events
    card.querySelectorAll(".up-btn").forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        if (idx === 0) return; // already at top
        const temp = teams[idx];
        teams[idx] = teams[idx - 1];
        teams[idx - 1] = temp;
        savePredictions();
        renderTournamentGroups();
      });
    });

    card.querySelectorAll(".down-btn").forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        if (idx === teams.length - 1) return; // already at bottom
        const temp = teams[idx];
        teams[idx] = teams[idx + 1];
        teams[idx + 1] = temp;
        savePredictions();
        renderTournamentGroups();
      });
    });

    container.appendChild(card);
  });
}

// Get all 48 teams list sorted alphabetically
function getAllTeams() {
  const list = [];
  const definition = {
    "A": ["Mexico", "South Africa", "South Korea", "Czechia"],
    "B": ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
    "C": ["Brazil", "Morocco", "Haiti", "Scotland"],
    "D": ["United States", "Paraguay", "Australia", "Turkey"],
    "E": ["Germany", "Curacao", "Ivory Coast", "Ecuador"],
    "F": ["Netherlands", "Japan", "Sweden", "Tunisia"],
    "G": ["Belgium", "Egypt", "Iran", "New Zealand"],
    "H": ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
    "I": ["France", "Senegal", "Iraq", "Norway"],
    "J": ["Argentina", "Algeria", "Austria", "Jordan"],
    "K": ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
    "L": ["England", "Croatia", "Ghana", "Panama"]
  };
  for (const teams of Object.values(definition)) {
    list.push(...teams);
  }
  return list.sort();
}

// Render Knock-out Selection checkbox lists
function renderKnockoutGrids() {
  const allTeams = getAllTeams();

  // Round of 32
  renderTeamCheckboxGrid("ko-r32-grid", allTeams, userPredictions.knockout.r32, 32, (selected) => {
    userPredictions.knockout.r32 = selected;
    // Auto cascade removals: if a team is removed from r32, it must be removed from later rounds too
    userPredictions.knockout.r16 = userPredictions.knockout.r16.filter(t => selected.includes(t));
    userPredictions.knockout.qf = userPredictions.knockout.qf.filter(t => selected.includes(t));
    userPredictions.knockout.sf = userPredictions.knockout.sf.filter(t => selected.includes(t));
    userPredictions.knockout.tf = userPredictions.knockout.tf.filter(t => selected.includes(t));
    userPredictions.knockout.finalists = userPredictions.knockout.finalists.filter(t => selected.includes(t));
    if (!selected.includes(userPredictions.knockout.champion)) userPredictions.knockout.champion = "";
    if (!selected.includes(userPredictions.knockout.thirdPlace)) userPredictions.knockout.thirdPlace = "";
    savePredictions();
    renderKnockoutGrids();
  });

  // Round of 16 (Only allowed from R32 selections)
  renderTeamCheckboxGrid("ko-r16-grid", userPredictions.knockout.r32, userPredictions.knockout.r16, 16, (selected) => {
    userPredictions.knockout.r16 = selected;
    userPredictions.knockout.qf = userPredictions.knockout.qf.filter(t => selected.includes(t));
    userPredictions.knockout.sf = userPredictions.knockout.sf.filter(t => selected.includes(t));
    userPredictions.knockout.tf = userPredictions.knockout.tf.filter(t => selected.includes(t));
    userPredictions.knockout.finalists = userPredictions.knockout.finalists.filter(t => selected.includes(t));
    if (!selected.includes(userPredictions.knockout.champion)) userPredictions.knockout.champion = "";
    if (!selected.includes(userPredictions.knockout.thirdPlace)) userPredictions.knockout.thirdPlace = "";
    savePredictions();
    renderKnockoutGrids();
  });

  // Quarter-finals (8 teams)
  renderTeamCheckboxGrid("ko-qf-grid", userPredictions.knockout.r16, userPredictions.knockout.qf, 8, (selected) => {
    userPredictions.knockout.qf = selected;
    userPredictions.knockout.sf = userPredictions.knockout.sf.filter(t => selected.includes(t));
    userPredictions.knockout.tf = userPredictions.knockout.tf.filter(t => selected.includes(t));
    userPredictions.knockout.finalists = userPredictions.knockout.finalists.filter(t => selected.includes(t));
    if (!selected.includes(userPredictions.knockout.champion)) userPredictions.knockout.champion = "";
    if (!selected.includes(userPredictions.knockout.thirdPlace)) userPredictions.knockout.thirdPlace = "";
    savePredictions();
    renderKnockoutGrids();
  });

  // Semi-finals (4 teams)
  renderTeamCheckboxGrid("ko-sf-grid", userPredictions.knockout.qf, userPredictions.knockout.sf, 4, (selected) => {
    userPredictions.knockout.sf = selected;
    userPredictions.knockout.tf = userPredictions.knockout.tf.filter(t => selected.includes(t));
    userPredictions.knockout.finalists = userPredictions.knockout.finalists.filter(t => selected.includes(t));
    if (!selected.includes(userPredictions.knockout.champion)) userPredictions.knockout.champion = "";
    if (!selected.includes(userPredictions.knockout.thirdPlace)) userPredictions.knockout.thirdPlace = "";
    savePredictions();
    renderKnockoutGrids();
  });

  // Third-place match participants (2 teams)
  renderTeamCheckboxGrid("ko-tf-grid", userPredictions.knockout.sf, userPredictions.knockout.tf, 2, (selected) => {
    userPredictions.knockout.tf = selected;
    if (!selected.includes(userPredictions.knockout.thirdPlace)) userPredictions.knockout.thirdPlace = "";
    savePredictions();
    renderKnockoutGrids();
  });

  // Finalists (2 teams)
  renderTeamCheckboxGrid("ko-finalists-grid", userPredictions.knockout.sf, userPredictions.knockout.finalists, 2, (selected) => {
    userPredictions.knockout.finalists = selected;
    if (!selected.includes(userPredictions.knockout.champion)) userPredictions.knockout.champion = "";
    savePredictions();
    renderKnockoutGrids();
  });

  // Champion select dropdown
  const champSelect = document.getElementById("ko-champion-select");
  champSelect.innerHTML = `<option value="">Kies Kampioen...</option>`;
  userPredictions.knockout.finalists.forEach(team => {
    const opt = document.createElement("option");
    opt.value = team;
    opt.textContent = team;
    if (userPredictions.knockout.champion === team) opt.selected = true;
    champSelect.appendChild(opt);
  });
  champSelect.disabled = isDeadlinePassed;
  champSelect.onchange = (e) => {
    userPredictions.knockout.champion = e.target.value;
    savePredictions();
  };

  // Third Place select dropdown (from third-place match participants)
  const thirdSelect = document.getElementById("ko-third-place-select");
  thirdSelect.innerHTML = `<option value="">Kies 3e Plaats...</option>`;
  userPredictions.knockout.tf.forEach(team => {
    const opt = document.createElement("option");
    opt.value = team;
    opt.textContent = team;
    if (userPredictions.knockout.thirdPlace === team) opt.selected = true;
    thirdSelect.appendChild(opt);
  });
  thirdSelect.disabled = isDeadlinePassed;
  thirdSelect.onchange = (e) => {
    userPredictions.knockout.thirdPlace = e.target.value;
    savePredictions();
  };

  // Trivia & penalty minutes predictions Hook
  const yellowInput = document.getElementById("trivia-yellow-card");
  const redInput = document.getElementById("trivia-red-card");
  const firstGoalInput = document.getElementById("trivia-first-goal");
  const topscorerInput = document.getElementById("trivia-topscorer");

  yellowInput.value = userPredictions.trivia.yellowCard || "";
  redInput.value = userPredictions.trivia.redCard || "";
  firstGoalInput.value = userPredictions.trivia.firstGoal || "";
  topscorerInput.value = userPredictions.trivia.topscorer || "";

  yellowInput.disabled = isDeadlinePassed;
  redInput.disabled = isDeadlinePassed;
  firstGoalInput.disabled = isDeadlinePassed;
  topscorerInput.disabled = isDeadlinePassed;

  const saveTrivia = () => {
    userPredictions.trivia.yellowCard = yellowInput.value !== "" ? parseInt(yellowInput.value) : null;
    userPredictions.trivia.redCard = redInput.value !== "" ? parseInt(redInput.value) : null;
    userPredictions.trivia.firstGoal = firstGoalInput.value !== "" ? parseInt(firstGoalInput.value) : null;
    userPredictions.trivia.topscorer = topscorerInput.value.trim();
    savePredictions();
  };

  yellowInput.onchange = saveTrivia;
  redInput.onchange = saveTrivia;
  firstGoalInput.onchange = saveTrivia;
  topscorerInput.onchange = saveTrivia;
}

// Checkbox helper grid
function renderTeamCheckboxGrid(elementId, availableTeams, selectedArray, maxLimit, onChangeCallback) {
  const grid = document.getElementById(elementId);
  grid.innerHTML = "";

  if (availableTeams.length === 0) {
    grid.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted); padding:0.5rem;">Selecteer eerst teams in de vorige ronde...</span>`;
    return;
  }

  availableTeams.forEach(team => {
    const isSelected = selectedArray.includes(team);
    const code = flagMap[team.toLowerCase()] || "un";
    
    const label = document.createElement("label");
    label.className = `team-checkbox-label ${isSelected ? 'selected' : ''}`;
    
    label.innerHTML = `
      <input type="checkbox" value="${team}" ${isSelected ? 'checked' : ''} ${isDeadlinePassed ? 'disabled' : ''}>
      <img class="team-flag" style="width:20px; height:14px;" src="https://flagcdn.com/w40/${code}.png" alt="${team}">
      <span>${team}</span>
    `;

    const checkbox = label.querySelector("input");
    checkbox.addEventListener("change", () => {
      let currentSelected = [...selectedArray];
      if (checkbox.checked) {
        if (currentSelected.length >= maxLimit) {
          checkbox.checked = false;
          showToast(`Maximaal ${maxLimit} teams in deze ronde!`);
          return;
        }
        currentSelected.push(team);
      } else {
        currentSelected = currentSelected.filter(t => t !== team);
      }
      onChangeCallback(currentSelected);
    });

    grid.appendChild(label);
  });
}

// Mathematical points engine & calculations
let cachedTotalPoints = 0;
let cachedExactScores = 0;
let cachedMotdPoints = 0;
let cachedPenaltyPoints = 0;

function calculateScores() {
  const actualData = getActualData();
  const list = actualData.matches;
  const actualStats = actualData.stats;

  let totalPoints = 0;
  let exactScores = 0;
  let motdPoints = 0;
  let penaltyPoints = 0;

  // 1. Matches points calculation
  list.forEach(m => {
    const pred = userPredictions.matches[m.id];
    if (!pred || pred.homeScore === "" || pred.awayScore === "") return; // missing prediction

    const actual = m.actual_score;
    if (!actual) return; // not played yet

    const pH = pred.homeScore;
    const pA = pred.awayScore;
    const aH = actual.home;
    const aA = actual.away;

    // Check outcome winners
    const isPredHomeWin = pH > pA;
    const isPredAwayWin = pA > pH;
    const isPredDraw = pH === pA;

    const isActualHomeWin = aH > aA;
    const isActualAwayWin = aA > aH;
    const isActualDraw = aH === aA;

    const isWinnerCorrect = (isPredHomeWin && isActualHomeWin) || (isPredAwayWin && isActualAwayWin);
    const isDrawCorrect = isPredDraw && isActualDraw && (pH !== aH); // correct draw but wrong score
    const isExactScore = (pH === aH) && (pA === aA);

    let matchScore = 0;

    if (m.match_of_the_day) {
      // MOTD: Max 20 points
      if (isExactScore) {
        matchScore = 12;
        exactScores++;
      } else if (isDrawCorrect) {
        matchScore = 8;
      } else if (isWinnerCorrect) {
        matchScore = 6;
        if (pH === aH) matchScore += 2;
        if (pA === aA) matchScore += 2;
      }

      // First scorers (+4 pts each)
      if (pred.homeScorer && m.home_first_scorer && pred.homeScorer.toLowerCase().trim() === m.home_first_scorer.toLowerCase().trim()) {
        matchScore += 4;
      }
      if (pred.awayScorer && m.away_first_scorer && pred.awayScorer.toLowerCase().trim() === m.away_first_scorer.toLowerCase().trim()) {
        matchScore += 4;
      }

      // Cap at 20 points
      matchScore = Math.min(20, matchScore);
      motdPoints += matchScore;
    } else {
      // Regular Match: Max 10 points
      if (isExactScore) {
        matchScore = 10;
        exactScores++;
      } else if (isDrawCorrect) {
        matchScore = 7;
      } else if (isWinnerCorrect) {
        matchScore = 5;
        if (pH === aH) matchScore += 2;
        if (pA === aA) matchScore += 2;
      }
      matchScore = Math.min(10, matchScore);
    }

    totalPoints += matchScore;
  });

  // 2. Tournament points calculation
  // Group standings: 5 pts per correct team position
  const letters = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  letters.forEach(g => {
    const pred = userPredictions.groups[g];
    const actual = actualStats.group_standings[g];
    if (pred && actual && actual.length === 4) {
      for (let i = 0; i < 4; i++) {
        if (pred[i] === actual[i]) {
          totalPoints += 5;
        }
      }
    }
  });

  // Knockout rounds:
  // Round of 32: 2 pts per correct team
  if (userPredictions.knockout.r32.length > 0 && actualStats.knockout.round_of_32.length > 0) {
    userPredictions.knockout.r32.forEach(t => {
      if (actualStats.knockout.round_of_32.includes(t)) totalPoints += 2;
    });
  }
  // Round of 16: 3 pts per correct team
  if (userPredictions.knockout.r16.length > 0 && actualStats.knockout.round_of_16.length > 0) {
    userPredictions.knockout.r16.forEach(t => {
      if (actualStats.knockout.round_of_16.includes(t)) totalPoints += 3;
    });
  }
  // Quarter-finals: 10 pts per correct team
  if (userPredictions.knockout.qf.length > 0 && actualStats.knockout.quarter_finals.length > 0) {
    userPredictions.knockout.qf.forEach(t => {
      if (actualStats.knockout.quarter_finals.includes(t)) totalPoints += 10;
    });
  }
  // Semi-finals: 10 pts per correct team
  if (userPredictions.knockout.sf.length > 0 && actualStats.knockout.semi_finals.length > 0) {
    userPredictions.knockout.sf.forEach(t => {
      if (actualStats.knockout.semi_finals.includes(t)) totalPoints += 10;
    });
  }
  // Third place match participants: 10 pts per correct team
  if (userPredictions.knockout.tf.length > 0 && actualStats.knockout.third_place_match.length > 0) {
    userPredictions.knockout.tf.forEach(t => {
      if (actualStats.knockout.third_place_match.includes(t)) totalPoints += 10;
    });
  }
  // Finalists: 15 pts per correct team
  if (userPredictions.knockout.finalists.length > 0 && actualStats.knockout.finalists.length > 0) {
    userPredictions.knockout.finalists.forEach(t => {
      if (actualStats.knockout.finalists.includes(t)) totalPoints += 15;
    });
  }
  // Champion: 30 pts
  if (userPredictions.knockout.champion && actualStats.knockout.champion && userPredictions.knockout.champion === actualStats.knockout.champion) {
    totalPoints += 30;
  }
  // Third place: 15 pts
  if (userPredictions.knockout.thirdPlace && actualStats.knockout.third_place && userPredictions.knockout.thirdPlace === actualStats.knockout.third_place) {
    totalPoints += 15;
  }
  // Topscorer: 30 pts
  if (userPredictions.trivia.topscorer && actualStats.topscorer && userPredictions.trivia.topscorer.toLowerCase().trim() === actualStats.topscorer.toLowerCase().trim()) {
    totalPoints += 30;
  }

  // 3. Penalty card/goal minutes
  const penaltyCheck = (predMin, actualMin) => {
    if (predMin === null || predMin === undefined || predMin === "") return 10000;
    if (actualMin === null || actualMin === undefined) return 0; // event not happened yet, no penalty
    return Math.abs(predMin - actualMin);
  };

  if (actualStats.first_yellow_card_minute !== null) {
    penaltyPoints += penaltyCheck(userPredictions.trivia.yellowCard, actualStats.first_yellow_card_minute);
  }
  if (actualStats.first_red_card_minute !== null) {
    penaltyPoints += penaltyCheck(userPredictions.trivia.redCard, actualStats.first_red_card_minute);
  }
  if (actualStats.first_goal_minute !== null) {
    penaltyPoints += penaltyCheck(userPredictions.trivia.firstGoal, actualStats.first_goal_minute);
  }

  cachedTotalPoints = totalPoints;
  cachedExactScores = exactScores;
  cachedMotdPoints = motdPoints;
  cachedPenaltyPoints = penaltyPoints;
}

// Render Dashboard values
function renderDashboard() {
  calculateScores();
  
  document.getElementById("dashboard-total-score").textContent = cachedTotalPoints;
  document.getElementById("dashboard-exact-scores").textContent = cachedExactScores;
  document.getElementById("dashboard-motd-score").textContent = cachedMotdPoints;
  document.getElementById("dashboard-penalty-score").textContent = cachedPenaltyPoints.toLocaleString('nl-NL');

  // Build predictions overview table
  const tbody = document.getElementById("dashboard-predictions-tbody");
  tbody.innerHTML = "";

  const actualData = getActualData();
  const list = actualData.matches;

  let predictedCount = 0;
  list.forEach(m => {
    const pred = userPredictions.matches[m.id];
    if (!pred || pred.homeScore === "" || pred.awayScore === "") return;

    predictedCount++;
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid rgba(255, 255, 255, 0.03)";
    
    let actualText = "-";
    let pointsText = "-";
    if (m.actual_score) {
      actualText = `${m.actual_score.home} - ${m.actual_score.away}`;
      // Calculate specific points for this match
      let pts = 0;
      const pH = pred.homeScore;
      const pA = pred.awayScore;
      const aH = m.actual_score.home;
      const aA = m.actual_score.away;

      const isPredHomeWin = pH > pA;
      const isPredAwayWin = pA > pH;
      const isPredDraw = pH === pA;
      const isActualHomeWin = aH > aA;
      const isActualAwayWin = aA > aH;
      const isActualDraw = aH === aA;

      const isWinnerCorrect = (isPredHomeWin && isActualHomeWin) || (isPredAwayWin && isActualAwayWin);
      const isDrawCorrect = isPredDraw && isActualDraw && (pH !== aH);
      const isExactScore = (pH === aH) && (pA === aA);

      if (m.match_of_the_day) {
        if (isExactScore) pts = 12;
        else if (isDrawCorrect) pts = 8;
        else if (isWinnerCorrect) {
          pts = 6;
          if (pH === aH) pts += 2;
          if (pA === aA) pts += 2;
        }
        if (pred.homeScorer && m.home_first_scorer && pred.homeScorer.toLowerCase().trim() === m.home_first_scorer.toLowerCase().trim()) pts += 4;
        if (pred.awayScorer && m.away_first_scorer && pred.awayScorer.toLowerCase().trim() === m.away_first_scorer.toLowerCase().trim()) pts += 4;
        pts = Math.min(20, pts);
      } else {
        if (isExactScore) pts = 10;
        else if (isDrawCorrect) pts = 7;
        else if (isWinnerCorrect) {
          pts = 5;
          if (pH === aH) pts += 2;
          if (pA === aA) pts += 2;
        }
        pts = Math.min(10, pts);
      }
      pointsText = `${pts} pt`;
    }

    tr.innerHTML = `
      <td style="padding:0.75rem 0.5rem; font-weight:600;">
        ${m.home_team} vs ${m.away_team}
        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400; display:block;">${m.stage}</span>
      </td>
      <td style="padding:0.75rem 0.5rem; text-align:center; font-family:var(--font-heading); font-weight:700;">
        ${pred.homeScore} - ${pred.awayScore}
        ${m.match_of_the_day ? `<span style="font-size:0.7rem; color:var(--accent-gold); display:block;">MOTD: ${pred.homeScorer || '-'}/${pred.awayScorer || '-'}</span>` : ''}
      </td>
      <td style="padding:0.75rem 0.5rem; text-align:center; font-family:var(--font-heading); font-weight:700;">${actualText}</td>
      <td style="padding:0.75rem 0.5rem; text-align:right; font-weight:700; color:var(--accent-green);">${pointsText}</td>
    `;
    tbody.appendChild(tr);
  });

  if (predictedCount === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted);">Nog geen voorspellingen opgeslagen. Ga naar het 'Wedstrijden' tabblad!</td></tr>`;
  }
}

// Clipboard copying formatting (Kopieer Voorspellingen)
document.getElementById("btn-copy-predictions").addEventListener("click", () => {
  let text = "=== MIJN WK 2026 VOORSPELLINGEN ===\n\n";

  const actualData = getActualData();
  const list = actualData.matches;

  text += "--- WEDSTRIJDEN ---\n";
  list.forEach(m => {
    const pred = userPredictions.matches[m.id];
    if (pred && pred.homeScore !== "" && pred.awayScore !== "") {
      text += `${m.home_team} - ${m.away_team}: ${pred.homeScore}-${pred.awayScore}`;
      if (m.match_of_the_day) {
        text += ` (1e scorer: ${pred.homeScorer || '-'}/${pred.awayScorer || '-'})`;
      }
      text += "\n";
    }
  });

  text += "\n--- GROEPEN EINDSTANDEN ---\n";
  Object.keys(userPredictions.groups).sort().forEach(g => {
    text += `Groep ${g}: ${userPredictions.groups[g].join(" > ")}\n`;
  });

  text += "\n--- KNOCKOUT & TRIVIA ---\n";
  text += `16e Finales: ${userPredictions.knockout.r32.join(", ") || '-'}\n`;
  text += `8e Finales: ${userPredictions.knockout.r16.join(", ") || '-'}\n`;
  text += `Kwartfinales: ${userPredictions.knockout.qf.join(", ") || '-'}\n`;
  text += `Halve Finales: ${userPredictions.knockout.sf.join(", ") || '-'}\n`;
  text += `Troostfinale: ${userPredictions.knockout.tf.join(", ") || '-'}\n`;
  text += `Finalisten: ${userPredictions.knockout.finalists.join(", ") || '-'}\n`;
  text += `Kampioen: ${userPredictions.knockout.champion || '-'}\n`;
  text += `3e Plaats: ${userPredictions.knockout.thirdPlace || '-'}\n`;
  text += `Topscorer: ${userPredictions.trivia.topscorer || '-'}\n`;
  text += `Minuut 1e geel: ${userPredictions.trivia.yellowCard || '-'}\n`;
  text += `Minuut 1e rood: ${userPredictions.trivia.redCard || '-'}\n`;
  text += `Minuut 1e goal: ${userPredictions.trivia.firstGoal || '-'}\n`;

  navigator.clipboard.writeText(text).then(() => {
    showToast("Voorspellingen gekopieerd naar klembord!");
  }).catch(err => {
    console.error("Copy failed", err);
    showToast("Kopiëren mislukt, probeer handmatig.");
  });
});

// Toast notification trigger
function showToast(msg) {
  const el = document.getElementById("toast-message");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}

// Setup Admin Overrides Tab Controls
function setupAdminControls() {
  document.getElementById("admin-save-btn").addEventListener("click", () => {
    // Save stats overrides
    adminOverrides.stats.first_yellow_card_minute = getInputValueInt("admin-actual-yellow");
    adminOverrides.stats.first_red_card_minute = getInputValueInt("admin-actual-red");
    adminOverrides.stats.first_goal_minute = getInputValueInt("admin-actual-goal-min");
    adminOverrides.stats.first_goal_scorer = getInputValue("admin-actual-topscorer"); // stored as topscorer or scorer
    adminOverrides.stats.topscorer = getInputValue("admin-actual-topscorer");
    adminOverrides.stats.knockout.champion = getInputValue("admin-actual-champion");
    adminOverrides.stats.knockout.third_place = getInputValue("admin-actual-third");

    adminOverrides.stats.knockout.round_of_32 = getSplitValues("admin-actual-r32");
    adminOverrides.stats.knockout.round_of_16 = getSplitValues("admin-actual-r16");
    adminOverrides.stats.knockout.quarter_finals = getSplitValues("admin-actual-qf");
    adminOverrides.stats.knockout.semi_finals = getSplitValues("admin-actual-sf");
    adminOverrides.stats.knockout.third_place_match = getSplitValues("admin-actual-tf");
    adminOverrides.stats.knockout.finalists = getSplitValues("admin-actual-finalists");

    // Save group standings overrides
    const letters = ["A","B","C","D","E","F","G","H","I","J","K","L"];
    letters.forEach(g => {
      const val = getSplitValues(`admin-group-${g}`);
      if (val.length === 4) {
        adminOverrides.stats.group_standings[g] = val;
      }
    });

    // Save match scores overrides from inputs
    const container = document.getElementById("admin-matches-container");
    container.querySelectorAll(".admin-match-row").forEach(row => {
      const matchId = row.getAttribute("data-id");
      const hInput = row.querySelector(".admin-home-score");
      const aInput = row.querySelector(".admin-away-score");
      const hScorer = row.querySelector(".admin-home-scorer");
      const aScorer = row.querySelector(".admin-away-scorer");

      if (hInput.value !== "" && aInput.value !== "") {
        adminOverrides.matches[matchId] = {
          actual_score: {
            home: parseInt(hInput.value),
            away: parseInt(aInput.value)
          },
          home_first_scorer: hScorer ? hScorer.value.trim() : null,
          away_first_scorer: aScorer ? aScorer.value.trim() : null
        };
      } else {
        delete adminOverrides.matches[matchId];
      }
    });

    saveAdminOverrides();
  });

  document.getElementById("admin-reset-btn").addEventListener("click", () => {
    adminOverrides = {
      matches: {},
      stats: {
        first_yellow_card_minute: null,
        first_red_card_minute: null,
        first_goal_minute: null,
        first_goal_scorer: null,
        topscorer: null,
        group_standings: {},
        knockout: {
          round_of_32: [],
          round_of_16: [],
          quarter_finals: [],
          semi_finals: [],
          third_place_match: [],
          finalists: [],
          champion: "",
          third_place: ""
        }
      }
    };
    const letters = ["A","B","C","D","E","F","G","H","I","J","K","L"];
    letters.forEach(g => {
      adminOverrides.stats.group_standings[g] = [];
    });
    
    saveAdminOverrides();
    showToast("Overrides gewist!");
  });
}

function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function getInputValueInt(id) {
  const val = getInputValue(id);
  return val !== "" ? parseInt(val) : null;
}

function getSplitValues(id) {
  const val = getInputValue(id);
  if (!val) return [];
  return val.split(",").map(t => t.trim()).filter(t => t !== "");
}

// Render Admin Panel list
function renderAdminPanel() {
  // Set current statistics overrides values in inputs
  document.getElementById("admin-actual-yellow").value = adminOverrides.stats.first_yellow_card_minute || "";
  document.getElementById("admin-actual-red").value = adminOverrides.stats.first_red_card_minute || "";
  document.getElementById("admin-actual-goal-min").value = adminOverrides.stats.first_goal_minute || "";
  document.getElementById("admin-actual-topscorer").value = adminOverrides.stats.topscorer || "";
  document.getElementById("admin-actual-champion").value = adminOverrides.stats.knockout.champion || "";
  document.getElementById("admin-actual-third").value = adminOverrides.stats.knockout.third_place || "";

  document.getElementById("admin-actual-r32").value = (adminOverrides.stats.knockout.round_of_32 || []).join(", ");
  document.getElementById("admin-actual-r16").value = (adminOverrides.stats.knockout.round_of_16 || []).join(", ");
  document.getElementById("admin-actual-qf").value = (adminOverrides.stats.knockout.quarter_finals || []).join(", ");
  document.getElementById("admin-actual-sf").value = (adminOverrides.stats.knockout.semi_finals || []).join(", ");
  document.getElementById("admin-actual-tf").value = (adminOverrides.stats.knockout.third_place_match || []).join(", ");
  document.getElementById("admin-actual-finalists").value = (adminOverrides.stats.knockout.finalists || []).join(", ");

  // Populate groups standings overrides
  const groupsBox = document.getElementById("admin-groups-standings");
  groupsBox.innerHTML = "";
  const letters = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  letters.forEach(g => {
    const div = document.createElement("div");
    div.className = "form-group";
    const val = (adminOverrides.stats.group_standings[g] || []).join(", ");
    div.innerHTML = `
      <label class="trivia-input-label" for="admin-group-${g}">Groep ${g} Eindstand</label>
      <input type="text" class="trivia-input" id="admin-group-${g}" value="${val}" placeholder="Team 1, Team 2, Team 3, Team 4">
    `;
    groupsBox.appendChild(div);
  });

  // Populate Admin match uitslagen
  const actualData = getActualData();
  const list = actualData.matches;
  const matchContainer = document.getElementById("admin-matches-container");
  matchContainer.innerHTML = "";

  list.forEach(m => {
    const row = document.createElement("div");
    row.className = "admin-match-row";
    row.setAttribute("data-id", m.id);
    row.style.display = "flex";
    row.style.flexDirection = "column";
    row.style.gap = "0.5rem";
    row.style.padding = "0.75rem";
    row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";

    const override = adminOverrides.matches[m.id];
    const hScore = override ? override.actual_score.home : (m.actual_score ? m.actual_score.home : "");
    const aScore = override ? override.actual_score.away : (m.actual_score ? m.actual_score.away : "");
    
    let scorerFields = "";
    if (m.match_of_the_day) {
      const hScorer = override ? override.home_first_scorer : (m.home_first_scorer || "");
      const aScorer = override ? override.away_first_scorer : (m.away_first_scorer || "");
      scorerFields = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem;">
          <input type="text" class="scorer-input admin-home-scorer" value="${hScorer}" placeholder="1e scorer ${m.home_team}">
          <input type="text" class="scorer-input admin-away-scorer" value="${aScorer}" placeholder="1e scorer ${m.away_team}">
        </div>
      `;
    }

    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
        <span style="font-weight:600; font-size:0.9rem; flex:1;">${m.home_team} vs ${m.away_team} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">(${m.stage})</span></span>
        <div style="display:flex; align-items:center; gap:0.25rem;">
          <input type="number" class="score-input admin-home-score" style="width:40px; height:32px; font-size:1rem;" min="0" max="9" value="${hScore}">
          <span>-</span>
          <input type="number" class="score-input admin-away-score" style="width:40px; height:32px; font-size:1rem;" min="0" max="9" value="${aScore}">
        </div>
      </div>
      ${scorerFields}
    `;

    matchContainer.appendChild(row);
  });
}
