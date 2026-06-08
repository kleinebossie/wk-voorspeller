// Global Data
let tournamentData = null;
let userPredictions = {}; // matchId -> { homeScore, awayScore }

/**
 * Debounce helper to limit function execution rate
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

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
  setupCustomCalculator();
  setupDashboardActions();
  renderAll();
});

// Navigation Tabs Setup
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

// Countdown Clock Setup
function setupCountdown() {
  const counterText = document.getElementById("countdown-text");
  
  function updateTimer() {
    const now = new Date();
    const diff = TOURNAMENT_DEADLINE - now;
    
    if (diff <= 0) {
      counterText.textContent = "Toernooi gestart!";
      clearInterval(timerInterval);
    } else {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      counterText.textContent = `Start in: ${days}d ${hours}u ${mins}m`;
    }
  }

  updateTimer();
  const timerInterval = setInterval(updateTimer, 60000);
}

// Load match data
async function loadData() {
  try {
    const response = await fetch("data/wc2026.json?t=" + new Date().getTime());
    if (response.ok) {
      tournamentData = await response.json();
    } else {
      throw new Error("Failed to load JSON");
    }
  } catch (err) {
    console.warn("Could not load tournament json, using fallbacks", err);
    tournamentData = { matches: [] };
  }
}

// LocalStorage loaders/savers
function loadLocalStorage() {
  const pred = localStorage.getItem("wk_user_predictions_xpts");
  if (pred) {
    try {
      userPredictions = JSON.parse(pred);
    } catch(e) { 
      console.error(e); 
      userPredictions = {};
    }
  }
}

function savePredictions() {
  localStorage.setItem("wk_user_predictions_xpts", JSON.stringify(userPredictions));
  updateDashboardStats();
}

// Factorial helper with memoization
const factorial = (function() {
  const cache = [1, 1];
  return function(n) {
    const num = Math.floor(n);
    if (num < 0) return 1;
    if (cache[num] !== undefined) return cache[num];
    for (let i = cache.length; i <= num; i++) {
      cache[i] = cache[i - 1] * i;
    }
    return cache[num];
  };
})();

// Estimate expected goals from over/under odds using Poisson CDF and binary search
function estimateExpectedGoals(line, overOdds, underOdds) {
  const l = parseFloat(line) || 2.5;
  const o = parseFloat(overOdds) || 1.9;
  const u = parseFloat(underOdds) || 1.9;

  const impliedOver = 1 / o;
  const impliedUnder = 1 / u;
  const sumImplied = impliedOver + impliedUnder;
  if (sumImplied === 0) return 2.6;
  
  const pUnder = impliedUnder / sumImplied;
  const n = Math.floor(l);
  
  // Poisson CDF function: sum_{k=0}^{n} (e^-lambda * lambda^k) / k!
  const poissonCDF = (lambda, limit) => {
    let sum = 0;
    let term = Math.exp(-lambda); // e^-lambda
    let lambdaPower = 1;
    let fact = 1;
    for (let k = 0; k <= limit; k++) {
      if (k > 0) {
        lambdaPower *= lambda;
        fact *= k;
      }
      sum += (term * lambdaPower) / fact;
    }
    return sum;
  };
  
  // Binary search for lambda (expected goals)
  let low = 0.01;
  let high = 15.0;
  let epsilon = 0.0001;
  let iterations = 0;
  
  while (high - low > epsilon && iterations < 50) {
    let mid = (low + high) / 2;
    let val = poissonCDF(mid, n);
    if (val > pUnder) {
      low = mid;
    } else {
      high = mid;
    }
    iterations++;
  }
  
  return (low + high) / 2;
}

// Calculate the full 2D probability matrix for scores 0-0 up to 8-8
function calculateScoreProbabilities(odds) {
  const oHome = parseFloat(odds.home) || 2.2;
  const oDraw = parseFloat(odds.draw) || 3.2;
  const oAway = parseFloat(odds.away) || 3.2;

  const impliedHome = 1 / oHome;
  const impliedDraw = 1 / oDraw;
  const impliedAway = 1 / oAway;
  const sumImplied = impliedHome + impliedDraw + impliedAway;

  const pH = impliedHome / sumImplied;
  const pD = impliedDraw / sumImplied;
  const pA = impliedAway / sumImplied;

  let baseExpectedGoals = 2.6;
  if (odds && odds.totals) {
    baseExpectedGoals = estimateExpectedGoals(odds.totals.line, odds.totals.over, odds.totals.under);
  }
  const expectedGoals = baseExpectedGoals;

  // Distribute goals using outcome weights
  const weightH = pH + 0.5 * pD;
  const weightA = pA + 0.5 * pD;
  const lambdaH = expectedGoals * (weightH / (weightH + weightA));
  const lambdaA = expectedGoals * (weightA / (weightH + weightA));

  const poissonProb = (lambda, k) => {
    return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
  };

  const maxGoals = 8;
  const rawMatrix = [];
  let wHomeRaw = 0, wDrawRaw = 0, wAwayRaw = 0;

  // Compute raw independent Poisson score probabilities
  for (let h = 0; h <= maxGoals; h++) {
    rawMatrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const pHomeGoal = poissonProb(lambdaH, h);
      const pAwayGoal = poissonProb(lambdaA, a);
      const prob = pHomeGoal * pAwayGoal;
      rawMatrix[h][a] = prob;

      if (h > a) wHomeRaw += prob;
      else if (h === a) wDrawRaw += prob;
      else wAwayRaw += prob;
    }
  }

  // Adjust raw scores to match target outcomes (pH, pD, pA)
  let sumAdj = 0;
  const adjMatrix = [];
  for (let h = 0; h <= maxGoals; h++) {
    adjMatrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      let prob = rawMatrix[h][a];
      if (h > a && wHomeRaw > 0) prob *= (pH / wHomeRaw);
      else if (h === a && wDrawRaw > 0) prob *= (pD / wDrawRaw);
      else if (h < a && wAwayRaw > 0) prob *= (pA / wAwayRaw);

      adjMatrix[h][a] = prob;
      sumAdj += prob;
    }
  }

  // Normalize final adjusted probabilities
  const finalMatrix = [];
  for (let h = 0; h <= maxGoals; h++) {
    finalMatrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      finalMatrix[h][a] = adjMatrix[h][a] / sumAdj;
    }
  }

  return {
    matrix: finalMatrix,
    lambdaH,
    lambdaA,
    expectedGoals,
    pH, pD, pA
  };
}

/**
 * Pre-calculates aggregate probability values from the score matrix
 * to allow O(1) expected points calculation.
 */
function getMatrixAggregates(probMatrix) {
  const maxGoals = probMatrix.length - 1;
  const aggregates = {
    pHomeWin: 0, pAwayWin: 0, pDraw: 0,
    pHomeGoalsWin: new Float64Array(maxGoals + 1),
    pAwayGoalsWin: new Float64Array(maxGoals + 1),
    pHomeGoalsAwayWin: new Float64Array(maxGoals + 1),
    pAwayGoalsAwayWin: new Float64Array(maxGoals + 1),
    pHomeGoalsTotal: new Float64Array(maxGoals + 1),
    pAwayGoalsTotal: new Float64Array(maxGoals + 1)
  };

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = probMatrix[h][a];
      if (p === 0) continue;

      aggregates.pHomeGoalsTotal[h] += p;
      aggregates.pAwayGoalsTotal[a] += p;

      if (h > a) {
        aggregates.pHomeWin += p;
        aggregates.pHomeGoalsWin[h] += p;
        aggregates.pAwayGoalsWin[a] += p;
      } else if (h < a) {
        aggregates.pAwayWin += p;
        aggregates.pHomeGoalsAwayWin[h] += p;
        aggregates.pAwayGoalsAwayWin[a] += p;
      } else {
        aggregates.pDraw += p;
      }
    }
  }
  return aggregates;
}

/**
 * Optimized O(1) expected points calculation using pre-calculated aggregates.
 */
function calculateExpectedPointsFast(predHome, predAway, isMotd, probMatrix, aggregates) {
  const maxGoals = probMatrix.length - 1;
  let xPts = 0;
  const probExact = (predHome <= maxGoals && predAway <= maxGoals) ? probMatrix[predHome][predAway] : 0;

  if (isMotd) {
    // Scorer bonus: 4 pts if team scores, 0 if not (expected value calculation)
    // predHome == 0 -> bonus if h == 0. predHome > 0 -> bonus (1/3) if h > 0.
    const eHScorer = (predHome === 0) ? aggregates.pHomeGoalsTotal[0] : (1/3.0) * (1 - aggregates.pHomeGoalsTotal[0]);
    const eAScorer = (predAway === 0) ? aggregates.pAwayGoalsTotal[0] : (1/3.0) * (1 - aggregates.pAwayGoalsTotal[0]);
    xPts += 4 * (eHScorer + eAScorer);

    if (predHome === predAway) {
      // Draw: 8 pts for draw, +4 for exact score (total 12)
      xPts += 8 * aggregates.pDraw + 4 * probExact;
    } else if (predHome > predAway) {
      // Home Win: 6 pts for outcome, +2 for each correct goal, +2 more for exact score (total 12 if exact)
      xPts += 6 * aggregates.pHomeWin +
             2 * (predHome <= maxGoals ? aggregates.pHomeGoalsWin[predHome] : 0) +
             2 * (predAway <= maxGoals ? aggregates.pAwayGoalsWin[predAway] : 0) +
             2 * probExact;
    } else {
      // Away Win
      xPts += 6 * aggregates.pAwayWin +
             2 * (predHome <= maxGoals ? aggregates.pHomeGoalsAwayWin[predHome] : 0) +
             2 * (predAway <= maxGoals ? aggregates.pAwayGoalsAwayWin[predAway] : 0) +
             2 * probExact;
    }
  } else {
    if (predHome === predAway) {
      // Draw: 7 pts for draw, +3 for exact score (total 10)
      xPts += 7 * aggregates.pDraw + 3 * probExact;
    } else if (predHome > predAway) {
      // Home Win: 5 pts for outcome, +2 for each correct goal, +1 more for exact score (total 10)
      xPts += 5 * aggregates.pHomeWin +
             2 * (predHome <= maxGoals ? aggregates.pHomeGoalsWin[predHome] : 0) +
             2 * (predAway <= maxGoals ? aggregates.pAwayGoalsWin[predAway] : 0) +
             probExact;
    } else {
      // Away Win
      xPts += 5 * aggregates.pAwayWin +
             2 * (predHome <= maxGoals ? aggregates.pHomeGoalsAwayWin[predHome] : 0) +
             2 * (predAway <= maxGoals ? aggregates.pAwayGoalsAwayWin[predAway] : 0) +
             probExact;
    }
  }
  return xPts;
}

// Find optimal score prediction that maximizes expected points
function findOptimalPrediction(isMotd, probMatrix, aggregates = null) {
  if (!aggregates) aggregates = getMatrixAggregates(probMatrix);
  let maxXPts = -1;
  let optimalH = 1;
  let optimalA = 1;

  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      const xPts = calculateExpectedPointsFast(h, a, isMotd, probMatrix, aggregates);
      if (xPts > maxXPts) {
        maxXPts = xPts;
        optimalH = h;
        optimalA = a;
      }
    }
  }

  return {
    home: optimalH,
    away: optimalA,
    xPts: maxXPts
  };
}

// Live calculation & updates on custom match calculator
function updateCustomCalculator() {
  const isMotd = document.getElementById("calc-motd").checked;
  const oHome = Math.max(1.01, parseFloat(document.getElementById("calc-odds-home").value) || 2.2);
  const oDraw = Math.max(1.01, parseFloat(document.getElementById("calc-odds-draw").value) || 3.2);
  const oAway = Math.max(1.01, parseFloat(document.getElementById("calc-odds-away").value) || 3.2);
  
  const ouLine = parseFloat(document.getElementById("calc-ou-line").value) || 2.5;
  const oOver = Math.max(1.01, parseFloat(document.getElementById("calc-odds-over").value) || 1.9);
  const oUnder = Math.max(1.01, parseFloat(document.getElementById("calc-odds-under").value) || 1.9);

  const predH = parseInt(document.getElementById("calc-pred-home").value);
  const predA = parseInt(document.getElementById("calc-pred-away").value);

  const odds = {
    home: oHome,
    draw: oDraw,
    away: oAway,
    totals: { line: ouLine, over: oOver, under: oUnder }
  };

  const results = calculateScoreProbabilities(odds);
  const aggregates = getMatrixAggregates(results.matrix);
  const xPts = calculateExpectedPointsFast(predH, predA, isMotd, results.matrix, aggregates);
  const optimal = findOptimalPrediction(isMotd, results.matrix, aggregates);

  // Update DOM values
  document.getElementById("calc-xpts-val").textContent = xPts.toFixed(2) + " pt";
  document.getElementById("calc-optimal-tip").innerHTML = `Beste voorspelling: <strong>${optimal.home} - ${optimal.away}</strong> (xPts: ${optimal.xPts.toFixed(2)})`;
  document.getElementById("calc-exp-goals").textContent = results.expectedGoals.toFixed(2);
  document.getElementById("calc-win-prob").textContent = `1: ${(results.pH * 100).toFixed(0)}% / X: ${(results.pD * 100).toFixed(0)}% / 2: ${(results.pA * 100).toFixed(0)}%`;

  // Render Top 10 predictions table
  const tbody = document.getElementById("calc-top-tbody");
  tbody.innerHTML = "";

  const scoreOptions = [];
  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      scoreOptions.push({
        home: h,
        away: a,
        prob: results.matrix[h]?.[a] || 0,
        xPts: calculateExpectedPointsFast(h, a, isMotd, results.matrix, aggregates)
      });
    }
  }

  scoreOptions.sort((a, b) => b.xPts - a.xPts);
  const top10 = scoreOptions.slice(0, 10);

  top10.forEach((opt, idx) => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid rgba(255, 255, 255, 0.03)";
    tr.style.background = (opt.home === predH && opt.away === predA) ? "rgba(139, 92, 246, 0.15)" : "transparent";
    
    tr.innerHTML = `
      <td style="padding: 0.4rem 0.5rem; font-weight:700;">
        ${idx + 1}. <span style="font-family:var(--font-heading); color:var(--text-light); margin-left:5px;">${opt.home} - ${opt.away}</span>
      </td>
      <td style="padding: 0.4rem 0.5rem; text-align: center; color: var(--text-muted);">
        ${(opt.prob * 100).toFixed(1)}%
      </td>
      <td style="padding: 0.4rem 0.5rem; text-align: right; font-weight: 700; color: var(--accent-green);">
        ${opt.xPts.toFixed(2)} pt
      </td>
    `;
    
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      document.getElementById("calc-pred-home").value = opt.home;
      document.getElementById("calc-pred-away").value = opt.away;
      updateCustomCalculator();
    });

    tbody.appendChild(tr);
  });
}

function setupCustomCalculator() {
  const ids = [
    "calc-motd", "calc-home-name", "calc-away-name", 
    "calc-odds-home", "calc-odds-draw", "calc-odds-away",
    "calc-ou-line", "calc-odds-over", "calc-odds-under",
    "calc-pred-home", "calc-pred-away"
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateCustomCalculator);
      el.addEventListener("change", updateCustomCalculator);
    }
  });
}

// Filter values
let searchQuery = "";
let selectedRound = "all";

function setupFilters() {
  const debouncedRender = debounce(() => {
    renderMatches();
  }, 250);

  document.getElementById("match-search").addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    debouncedRender();
  });

  document.getElementById("match-round-filter").addEventListener("change", (e) => {
    selectedRound = e.target.value;
    renderMatches();
  });
}

// Global actions
function setupDashboardActions() {
  // Autofill all matches with mathematically optimal score
  document.getElementById("btn-autofill-optimal").addEventListener("click", () => {
    if (!tournamentData || !tournamentData.matches) return;
    
    tournamentData.matches.forEach(m => {
      const results = calculateScoreProbabilities(m.odds);
      const aggregates = getMatrixAggregates(results.matrix);
      const optimal = findOptimalPrediction(m.match_of_the_day, results.matrix, aggregates);
      userPredictions[m.id] = {
        homeScore: optimal.home,
        awayScore: optimal.away
      };
    });

    savePredictions();
    renderAll();
    showToast("Alle voorspellingen ingesteld op de wiskundig optimale uitslag!");
  });

  // Reset all predictions
  document.getElementById("btn-reset-predictions").addEventListener("click", () => {
    userPredictions = {};
    savePredictions();
    renderAll();
    showToast("Alle voorspellingen gewist.");
  });

  // Copy predictions to clipboard
  document.getElementById("btn-copy-predictions").addEventListener("click", () => {
    if (!tournamentData || !tournamentData.matches) return;

    let text = "=== MIJN WK 2026 VOORSPELLINGEN ===\n\n";
    let count = 0;

    tournamentData.matches.forEach(m => {
      const pred = userPredictions[m.id];
      if (pred && pred.homeScore !== "" && pred.homeScore !== undefined) {
        const results = calculateScoreProbabilities(m.odds);
        const aggregates = getMatrixAggregates(results.matrix);
        const xPts = calculateExpectedPointsFast(parseInt(pred.homeScore), parseInt(pred.awayScore), m.match_of_the_day, results.matrix, aggregates);
        
        text += `${m.home_team} - ${m.away_team}: ${pred.homeScore}-${pred.awayScore}`;
        if (m.match_of_the_day) {
          text += " [MOTD]";
        }
        text += ` (xPts: ${xPts.toFixed(2)} pt)\n`;
        count++;
      }
    });

    if (count === 0) {
      showToast("Geen voorspellingen ingevuld om te kopiëren!");
      return;
    }

    navigator.clipboard.writeText(text).then(() => {
      showToast("Voorspellingen gekopieerd naar klembord!");
    }).catch(err => {
      console.error("Copy failed", err);
      showToast("Kopiëren mislukt, probeer handmatig.");
    });
  });
}

// Dashboard statistics
function updateDashboardStats() {
  let totalXPts = 0;
  let predictedCount = 0;
  let optimalCount = 0;
  let totalMatchesCount = 0;

  if (tournamentData && tournamentData.matches) {
    totalMatchesCount = tournamentData.matches.length;
    tournamentData.matches.forEach(m => {
      const pred = userPredictions[m.id];
      const results = calculateScoreProbabilities(m.odds);
      const aggregates = getMatrixAggregates(results.matrix);
      const optimal = findOptimalPrediction(m.match_of_the_day, results.matrix, aggregates);

      if (pred && pred.homeScore !== "" && pred.homeScore !== undefined) {
        predictedCount++;
        const xPts = calculateExpectedPointsFast(parseInt(pred.homeScore), parseInt(pred.awayScore), m.match_of_the_day, results.matrix, aggregates);
        totalXPts += xPts;

        if (parseInt(pred.homeScore) === optimal.home && parseInt(pred.awayScore) === optimal.away) {
          optimalCount++;
        }
      }
    });
  }

  document.getElementById("dashboard-total-xpts").textContent = totalXPts.toFixed(2) + " pt";
  document.getElementById("dashboard-predicted-count").textContent = `${predictedCount} / ${totalMatchesCount}`;
  document.getElementById("dashboard-optimal-count").textContent = optimalCount;
}

// Render WK matches list
function renderMatches() {
  const container = document.getElementById("tournament-matches-container");
  container.innerHTML = "";

  if (!tournamentData || !tournamentData.matches || tournamentData.matches.length === 0) {
    container.innerHTML = `<div class="glass" style="padding: 2rem; text-align: center; color: var(--text-muted);">Geen wedstrijden geladen.</div>`;
    return;
  }

  const list = [...tournamentData.matches];
  list.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Filter
  const filtered = list.filter(m => {
    const home = m.home_team.toLowerCase();
    const away = m.away_team.toLowerCase();
    const matchSearch = home.includes(searchQuery) || away.includes(searchQuery);

    let matchRound = true;
    if (selectedRound !== "all") {
      if (selectedRound === "motd") {
        matchRound = m.match_of_the_day === true;
      } else {
        const stage = m.stage.toLowerCase();
        if (selectedRound === "groep") matchRound = stage.includes("groep");
        else if (selectedRound === "round of 32") matchRound = stage.includes("32") || stage.includes("16e");
        else if (selectedRound === "round of 16") matchRound = stage.includes("16") || stage.includes("8e");
        else if (selectedRound === "quarter") matchRound = stage.includes("kwart") || stage.includes("quarter");
        else if (selectedRound === "semi") matchRound = stage.includes("halve") || stage.includes("semi");
        else if (selectedRound === "final") matchRound = stage.includes("finale") || stage.includes("troost");
      }
    }

    return matchSearch && matchRound;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="glass" style="padding: 2rem; text-align: center; color: var(--text-muted);">Geen wedstrijden gevonden.</div>`;
    return;
  }

  filtered.forEach(m => {
    const pred = userPredictions[m.id] || { homeScore: "", awayScore: "" };
    
    // Date formatting
    const matchDate = new Date(m.date);
    const formattedDate = matchDate.toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    
    // Flag code lookup
    const homeCode = flagMap[m.home_team.toLowerCase()] || "un";
    const awayCode = flagMap[m.away_team.toLowerCase()] || "un";

    // Poisson probabilities & optimal prediction
    const results = calculateScoreProbabilities(m.odds);
    const aggregates = getMatrixAggregates(results.matrix);
    const optimal = findOptimalPrediction(m.match_of_the_day, results.matrix, aggregates);

    let liveXPts = 0;
    const hasPrediction = pred.homeScore !== "" && pred.homeScore !== undefined;
    if (hasPrediction) {
      liveXPts = calculateExpectedPointsFast(parseInt(pred.homeScore), parseInt(pred.awayScore), m.match_of_the_day, results.matrix, aggregates);
    }

    // Actual score & points if played
    let actualScoreDisplay = "";
    let actualPointsEarned = "";
    if (m.actual_score) {
      actualScoreDisplay = `<span class="actual-score-badge">${m.actual_score.home} - ${m.actual_score.away}</span>`;
      
      // Calculate actual points earned
      if (hasPrediction) {
        let actualPts = 0;
        const pH = parseInt(pred.homeScore);
        const pA = parseInt(pred.awayScore);
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
          if (isExactScore) actualPts = 12;
          else if (isDrawCorrect) actualPts = 8;
          else if (isWinnerCorrect) {
            actualPts = 6;
            if (pH === aH) actualPts += 2;
            if (pA === aA) actualPts += 2;
          }
          actualPts = Math.min(20, actualPts);
        } else {
          if (isExactScore) actualPts = 10;
          else if (isDrawCorrect) actualPts = 7;
          else if (isWinnerCorrect) {
            actualPts = 5;
            if (pH === aH) actualPts += 2;
            if (pA === aA) actualPts += 2;
          }
          actualPts = Math.min(10, actualPts);
        }

        actualPointsEarned = `<div style="font-size: 0.8rem; font-weight:700; color:var(--accent-green); margin-top:5px;">Behaald: ${actualPts} pt</div>`;
      }
    } else {
      actualScoreDisplay = `<span class="vs-text">VS</span>`;
    }

    const isOptimalSelected = hasPrediction && parseInt(pred.homeScore) === optimal.home && parseInt(pred.awayScore) === optimal.away;

    // Card card
    const card = document.createElement("div");
    card.className = `glass match-card ${m.match_of_the_day ? 'motd' : ''}`;

    card.innerHTML = `
      <div class="match-header">
        <span>${m.stage} &bull; ${formattedDate}</span>
        ${m.match_of_the_day ? `<span class="motd-badge">Match of the Day</span>` : ''}
      </div>
      
      <div class="match-teams">
        <div class="team-display home">
          <span class="team-name">${m.home_team}</span>
          <img class="team-flag" src="https://flagcdn.com/w80/${homeCode}.png" alt="${m.home_team}">
        </div>
        
        <div class="match-vs-score">
          ${actualScoreDisplay}
          <div class="prediction-inputs" style="margin-top: 0.5rem;">
            <input type="number" class="score-input home-input" min="0" max="9" value="${pred.homeScore !== undefined ? pred.homeScore : ''}" placeholder="-">
            <span style="font-weight: 700;">-</span>
            <input type="number" class="score-input away-input" min="0" max="9" value="${pred.awayScore !== undefined ? pred.awayScore : ''}" placeholder="-">
          </div>
          ${actualPointsEarned}
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
        ${m.odds.totals ? `
          <div class="odds-value" style="margin-left: 10px; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 10px;">
            O/U ${m.odds.totals.line}: Over <span>${m.odds.totals.over.toFixed(2)}</span> / Under <span>${m.odds.totals.under.toFixed(2)}</span>
          </div>
        ` : ''}
      </div>

      <!-- Live Expected Points Badge -->
      <div class="match-xpts-row ${m.match_of_the_day ? 'motd-xpts' : ''}">
        <span class="xpts-lbl">Verwachte Punten (xPts) voor jouw voorspelling:</span>
        <span class="xpts-num">${hasPrediction ? liveXPts.toFixed(2) : '0.00'} pt</span>
      </div>

      <!-- Optimal recommendation -->
      <div class="match-optimal-banner">
        <span class="optimal-txt">Beste voorspelling: <strong class="optimal-val">${optimal.home} - ${optimal.away}</strong> (xPts: ${optimal.xPts.toFixed(2)})</span>
        <button class="btn-choose-optimal ${isOptimalSelected ? 'active' : ''}" id="btn-opt-${m.id}">
          ${isOptimalSelected ? 'Geselecteerd' : 'Kies Optimaal'}
        </button>
      </div>
    `;

    // Hook inputs
    const homeInput = card.querySelector(".home-input");
    const awayInput = card.querySelector(".away-input");
    const optBtn = card.querySelector(`#btn-opt-${m.id}`);

    const saveMatchPred = () => {
      const hVal = homeInput.value;
      const aVal = awayInput.value;
      if (hVal !== "" && aVal !== "") {
        userPredictions[m.id] = {
          homeScore: parseInt(hVal),
          awayScore: parseInt(aVal)
        };
      } else {
        delete userPredictions[m.id];
      }
      savePredictions();
      
      const hasPred = homeInput.value !== "" && awayInput.value !== "";
      const xnum = card.querySelector(".xpts-num");
      if (hasPred) {
        const x = calculateExpectedPointsFast(parseInt(homeInput.value), parseInt(awayInput.value), m.match_of_the_day, results.matrix, aggregates);
        xnum.textContent = x.toFixed(2) + " pt";
        
        const isMatched = parseInt(homeInput.value) === optimal.home && parseInt(awayInput.value) === optimal.away;
        if (isMatched) {
          optBtn.classList.add("active");
          optBtn.textContent = "Geselecteerd";
        } else {
          optBtn.classList.remove("active");
          optBtn.textContent = "Kies Optimaal";
        }
      } else {
        xnum.textContent = "0.00 pt";
        optBtn.classList.remove("active");
        optBtn.textContent = "Kies Optimaal";
      }
    };

    homeInput.addEventListener("input", saveMatchPred);
    awayInput.addEventListener("input", saveMatchPred);

    optBtn.addEventListener("click", () => {
      homeInput.value = optimal.home;
      awayInput.value = optimal.away;
      saveMatchPred();
    });

    container.appendChild(card);
  });
}

// Main rendering routine
function renderAll() {
  renderMatches();
  updateDashboardStats();
  updateCustomCalculator();
}

// Toast helper
function showToast(msg) {
  const el = document.getElementById("toast-message");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}
