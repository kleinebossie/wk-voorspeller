#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
import urllib.error
import re
from datetime import datetime

# Configuration
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DATA_FILE = os.path.join(DATA_DIR, 'wc2026.json')
ODDS_API_KEY = os.environ.get('ODDS_API_KEY', '')
API_FOOTBALL_KEY = os.environ.get('API_FOOTBALL_KEY', '')
SPORT_KEY = 'soccer_fifa_world_cup'

# 48 teams divided into 12 groups
GROUPS_DEFINITION = {
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
}

TEAM_ALIASES = {
    "usa": "United States",
    "united states": "United States",
    "us": "United States",
    "south korea": "South Korea",
    "korea republic": "South Korea",
    "south africa": "South Africa",
    "czech republic": "Czechia",
    "czechia": "Czechia",
    "bosnia and herzegovina": "Bosnia and Herzegovina",
    "bosnia": "Bosnia and Herzegovina",
    "curacao": "Curacao",
    "curaçao": "Curacao",
    "ivory coast": "Ivory Coast",
    "cote d'ivoire": "Ivory Coast",
    "côte d'ivoire": "Ivory Coast",
    "iran": "Iran",
    "ir iran": "Iran",
    "islamic republic of iran": "Iran",
    "new zealand": "New Zealand",
    "cape verde": "Cape Verde",
    "cabo verde": "Cape Verde",
    "saudi arabia": "Saudi Arabia",
    "dr congo": "DR Congo",
    "congo dr": "DR Congo",
    "democratic republic of the congo": "DR Congo",
    "turkey": "Turkey",
    "türkiye": "Turkey"
}

def normalize_team_name(name):
    if not name:
        return ""
    clean = name.strip().lower()
    return TEAM_ALIASES.get(clean, name.strip())

def generate_default_matches():
    # Matches of the day schedule
    motd_schedule = {
        ("Mexico", "South Africa"): "2026-06-11",
        ("Brazil", "Morocco"): "2026-06-14",
        ("Japan", "Netherlands"): "2026-06-14",
        ("Belgium", "Egypt"): "2026-06-15",
        ("Croatia", "England"): "2026-06-17",
        ("Australia", "United States"): "2026-06-19",
        ("Netherlands", "Sweden"): "2026-06-20",
        ("Egypt", "New Zealand"): "2026-06-22",
        ("Algeria", "Jordan"): "2026-06-23",
        ("Colombia", "DR Congo"): "2026-06-24",
        ("Brazil", "Scotland"): "2026-06-25",
        ("Japan", "Sweden"): "2026-06-26",
        ("France", "Norway"): "2026-06-26",
        ("Spain", "Uruguay"): "2026-06-27"
    }

    matches = []
    
    for group_name, teams in GROUPS_DEFINITION.items():
        group_idx = ord(group_name) - ord('A')
        
        # Fixtures per group
        fixtures = [
            (teams[0], teams[1], 0), # Match 1
            (teams[2], teams[3], 0), # Match 2
            (teams[0], teams[2], 1), # Match 3
            (teams[3], teams[1], 1), # Match 4
            (teams[3], teams[0], 2), # Match 5
            (teams[1], teams[2], 2)  # Match 6
        ]
        
        for home, away, round_idx in fixtures:
            # Check if this match is in MOTD list
            pair = tuple(sorted([home, away]))
            
            is_motd = pair in motd_schedule
            if is_motd:
                date_str = motd_schedule[pair]
            else:
                # Regular match date calculation based on group index and round index
                # Spread group stages from June 11 to June 27
                day = 11 + round_idx * 5 + (group_idx // 2)
                day = min(27, max(11, day))
                date_str = f"2026-06-{day:02d}"
            
            # Hour of match (15:00, 18:00, 21:00) deterministically
            hour = 15 + ((hash(home + away) % 3) * 3)
            commence_time = f"{date_str}T{hour:02d}:00:00Z"
            
            matches.append({
                "id": "TEMP",
                "stage": f"Groep {group_name}",
                "home_team": home,
                "away_team": away,
                "date": commence_time,
                "odds": {
                    "home": 2.2,
                    "draw": 3.2,
                    "away": 3.2,
                    "totals": {
                        "line": 2.5,
                        "over": 1.9,
                        "under": 1.9
                    }
                },
                "actual_score": None,
                "match_of_the_day": is_motd,
                "home_first_scorer": None,
                "away_first_scorer": None
            })
            
    # Sort matches chronologically by date
    matches.sort(key=lambda m: m["date"])
    for idx, m in enumerate(matches):
        m["id"] = str(idx + 1)
        
    return matches

def load_existing_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {DATA_FILE}: {e}")
    return {
        "matches": generate_default_matches(),
        "stats": {
            "first_yellow_card_minute": None,
            "first_red_card_minute": None,
            "first_goal_minute": None,
            "first_goal_scorer": None,
            "topscorer": None,
            "group_standings": {g: [] for g in GROUPS_DEFINITION.keys()},
            "knockout": {
                "round_of_32": [],
                "round_of_16": [],
                "quarter_finals": [],
                "semi_finals": [],
                "third_place_match": [],
                "finalists": [],
                "champion": None,
                "third_place": None
            }
        }
    }

def fetch_json(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Failed to fetch JSON from {url}: {e}")
        return None

def fetch_html(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"Failed to fetch HTML from {url}: {e}")
        return None

def scrape_wikipedia(html_content, stats):
    if not html_content:
        return stats
        
    print("Scraping Wikipedia for stats...")
    
    # Helper to find first yellow/red/goal minutes from text or summary boxes
    # Often Wikipedia has "Opening goal", "First goal of the tournament was scored by... in the Xth minute"
    # Let's search using case-insensitive regexes
    
    # First goal minute & scorer
    goal_match = re.search(r'first goal.*?scored by\s+([A-Za-z\s]+)(?:.*?in the\s+(\d+))?', html_content, re.IGNORECASE)
    if goal_match:
        scorer = goal_match.group(1).strip()
        minute = goal_match.group(2)
        if minute:
            stats["first_goal_minute"] = int(minute)
            stats["first_goal_scorer"] = scorer
            print(f"Found first goal: {scorer} in minute {minute}")
            
    # First yellow card minute
    yellow_match = re.search(r'first yellow card.*?in the\s+(\d+)', html_content, re.IGNORECASE)
    if yellow_match:
        stats["first_yellow_card_minute"] = int(yellow_match.group(1))
        print(f"Found first yellow card: minute {stats['first_yellow_card_minute']}")
        
    # First red card minute
    red_match = re.search(r'first red card.*?in the\s+(\d+)', html_content, re.IGNORECASE)
    if red_match:
        stats["first_red_card_minute"] = int(red_match.group(1))
        print(f"Found first red card: minute {stats['first_red_card_minute']}")
        
    # Top scorers search (usually in a goalscorers list or table)
    # We look for lines like "X goals" or tables with scorers
    # Let's find players with highest goals. If none, we can parse table
    # This is a basic pattern search for a list of goalscorers
    scorers = []
    # Find table with class "wikitable" containing goalscorers
    # Let's extract any player with 4+ goals if present
    matches = re.findall(r'(\d+)\s+goals?\s*<\/h[34]>.*?<ul>(.*?)<\/ul>', html_content, re.DOTALL | re.IGNORECASE)
    for goals_str, list_content in matches:
        goals = int(goals_str)
        players = re.findall(r'<li><a[^>]*>([^<]+)</a>', list_content)
        for p in players:
            scorers.append({"player": p, "goals": goals})
            
    if scorers:
        # Sort by goals descending
        scorers.sort(key=lambda x: x["goals"], reverse=True)
        stats["topscorer"] = scorers[0]["player"]
        print(f"Found topscorer: {stats['topscorer']} ({scorers[0]['goals']} goals)")
        
    # Check if champion is decided (looking for "Champion" or final table)
    champ_match = re.search(r'Champions<\/th>\s*<td[^>]*>\s*<b><a[^>]*>([^<]+)</a>', html_content, re.IGNORECASE)
    if champ_match:
        stats["knockout"]["champion"] = normalize_team_name(champ_match.group(1))
        print(f"Found champion: {stats['knockout']['champion']}")
        
    return stats

def fetch_api_football_odds(api_key):
    if not api_key:
        print("API_FOOTBALL_KEY not set. Skipping API-Football update.")
        return {}

    headers = {
        'User-Agent': 'Mozilla/5.0',
        'x-apisports-key': api_key
    }

    # 1. Fetch fixtures mapping (league 1 is World Cup)
    fixtures_url = "https://v3.football.api-sports.io/fixtures?league=1&season=2026"
    print("Fetching fixtures from API-Football...")
    
    req_fixtures = urllib.request.Request(fixtures_url, headers=headers)
    try:
        with urllib.request.urlopen(req_fixtures, timeout=15) as response:
            fixtures_json = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Failed to fetch fixtures from API-Football: {e}")
        return {}

    if not fixtures_json or fixtures_json.get("errors") or not fixtures_json.get("response"):
        print(f"API-Football fixtures returned error or empty response: {fixtures_json.get('errors')}")
        return {}

    fixture_map = {}
    for item in fixtures_json["response"]:
        fid = str(item["fixture"]["id"])
        home = item.get("teams", {}).get("home", {}).get("name")
        away = item.get("teams", {}).get("away", {}).get("name")
        if home and away:
            fixture_map[fid] = {
                "home": normalize_team_name(home),
                "away": normalize_team_name(away)
            }

    # 2. Fetch odds
    odds_url = "https://v3.football.api-sports.io/odds?league=1&season=2026"
    print("Fetching odds from API-Football...")
    
    req_odds = urllib.request.Request(odds_url, headers=headers)
    try:
        with urllib.request.urlopen(req_odds, timeout=15) as response:
            odds_json = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Failed to fetch odds from API-Football: {e}")
        return {}

    if not odds_json or odds_json.get("errors") or not odds_json.get("response"):
        print(f"API-Football odds returned error or empty response: {odds_json.get('errors')}")
        return {}

    api_football_odds = {}

    for item in odds_json["response"]:
        fid = str(item["fixture"]["id"])
        if fid not in fixture_map:
            continue
            
        teams = fixture_map[fid]
        home = teams["home"]
        away = teams["away"]
        key = f"{home}:{away}"

        bookmakers = item.get("bookmakers", [])
        if not bookmakers:
            continue

        # Prefer Bet365 if available, otherwise first bookmaker
        selected_bm = None
        for bm in bookmakers:
            if bm.get("name") == "Bet365":
                selected_bm = bm
                break
        if not selected_bm:
            selected_bm = bookmakers[0]

        h2h_odds = None
        totals_odds = None

        for bet in selected_bm.get("bets", []):
            bet_name = bet.get("name")
            outcomes = bet.get("values", [])
            
            if bet_name == "Match Winner":
                h2h_odds = {"home": 2.2, "draw": 3.2, "away": 3.2}
                for outcome in outcomes:
                    val = outcome.get("value")
                    try:
                        odd = float(outcome.get("odd"))
                    except:
                        continue
                    if val in ["Home", "1", home]:
                        h2h_odds["home"] = odd
                    elif val in ["Draw", "N", "X"]:
                        h2h_odds["draw"] = odd
                    elif val in ["Away", "2", away]:
                        h2h_odds["away"] = odd
            elif bet_name == "Goals Over/Under":
                over_odd = None
                under_odd = None
                for outcome in outcomes:
                    val = outcome.get("value")
                    try:
                        odd = float(outcome.get("odd"))
                    except:
                        continue
                    if val == "Over 2.5":
                        over_odd = odd
                    elif val == "Under 2.5":
                        under_odd = odd
                if over_odd is not None and under_odd is not None:
                    totals_odds = {
                        "line": 2.5,
                        "over": over_odd,
                        "under": under_odd
                    }

        if h2h_odds:
            match_odds = {
                "home": h2h_odds["home"],
                "draw": h2h_odds["draw"],
                "away": h2h_odds["away"]
            }
            if totals_odds:
                match_odds["totals"] = totals_odds
            else:
                match_odds["totals"] = {"line": 2.5, "over": 1.9, "under": 1.9}
            
            api_football_odds[key] = match_odds

    return api_football_odds

def update_odds_and_scores(data):
    if not ODDS_API_KEY and not API_FOOTBALL_KEY:
        print("Neither ODDS_API_KEY nor API_FOOTBALL_KEY is set. Skipping Odds update.")
        return data
        
    # Fetch Odds from The Odds API if available
    odds_json = None
    odds_by_match = {}
    if ODDS_API_KEY:
        # Fetch Odds
        odds_url = f"https://api.the-odds-api.com/v4/sports/{SPORT_KEY}/odds/?apiKey={ODDS_API_KEY}&regions=eu&markets=h2h,totals"
        print(f"Fetching odds from Odds API...")
        odds_json = fetch_json(odds_url)
        
        if odds_json:
            for match in odds_json:
                home = normalize_team_name(match.get("home_team"))
                away = normalize_team_name(match.get("away_team"))
                
                # Find bookmaker odds (average or first bookmaker)
                h2h_odds = {"home": 2.2, "draw": 3.2, "away": 3.2}
                totals_odds = None
                bookmakers = match.get("bookmakers", [])
                if bookmakers:
                    markets = bookmakers[0].get("markets", [])
                    for market in markets:
                        market_key = market.get("key")
                        outcomes = market.get("outcomes", [])
                        if market_key == "h2h":
                            for outcome in outcomes:
                                name = outcome.get("name")
                                price = outcome.get("price")
                                if name == match.get("home_team"):
                                    h2h_odds["home"] = price
                                elif name == match.get("away_team"):
                                    h2h_odds["away"] = price
                                else:
                                    h2h_odds["draw"] = price
                        elif market_key == "totals":
                            over_odds = None
                            under_odds = None
                            point = None
                            for outcome in outcomes:
                                name = outcome.get("name")
                                price = outcome.get("price")
                                point = outcome.get("point")
                                if name == "Over":
                                    over_odds = price
                                elif name == "Under":
                                    under_odds = price
                            if over_odds is not None and under_odds is not None and point is not None:
                                totals_odds = {
                                    "line": point,
                                    "over": over_odds,
                                    "under": under_odds
                                }
                
                match_odds = {
                    "home": h2h_odds["home"],
                    "draw": h2h_odds["draw"],
                    "away": h2h_odds["away"]
                }
                if totals_odds:
                    match_odds["totals"] = totals_odds
                else:
                    match_odds["totals"] = {"line": 2.5, "over": 1.9, "under": 1.9}
                
                odds_by_match[f"{home}:{away}"] = {
                    "odds": match_odds,
                    "date": match.get("commence_time")
                }

    # Fetch Scores from The Odds API if available
    scores_by_match = {}
    if ODDS_API_KEY:
        scores_url = f"https://api.the-odds-api.com/v4/sports/{SPORT_KEY}/scores/?apiKey={ODDS_API_KEY}&daysFrom=3"
        print(f"Fetching scores from Odds API...")
        scores_json = fetch_json(scores_url)
        if scores_json:
            for match in scores_json:
                home = normalize_team_name(match.get("home_team"))
                away = normalize_team_name(match.get("away_team"))
                
                actual_score = None
                if match.get("completed"):
                    scores = match.get("scores")
                    if scores and len(scores) == 2:
                        h_score = int(scores[0]["score"]) if scores[0]["name"] == match.get("home_team") else int(scores[1]["score"])
                        a_score = int(scores[1]["score"]) if scores[1]["name"] == match.get("away_team") else int(scores[0]["score"])
                        actual_score = {"home": h_score, "away": a_score}
                        
                scores_by_match[f"{home}:{away}"] = actual_score

    # Fetch Odds from API-Football if available
    api_football_odds = {}
    if API_FOOTBALL_KEY:
        api_football_odds = fetch_api_football_odds(API_FOOTBALL_KEY)

    # Update our matches list
    for match in data["matches"]:
        home = normalize_team_name(match["home_team"])
        away = normalize_team_name(match["away_team"])
        key = f"{home}:{away}"
        rev_key = f"{away}:{home}"
        
        # Match normal key or reversed key
        odds_applied = False
        if api_football_odds:
            if key in api_football_odds:
                match["odds"] = api_football_odds[key]
                odds_applied = True
            elif rev_key in api_football_odds:
                # Swap home/away odds
                odds = api_football_odds[rev_key]
                match["odds"] = {
                    "home": odds["away"],
                    "draw": odds["draw"],
                    "away": odds["home"]
                }
                if "totals" in odds:
                    match["odds"]["totals"] = odds["totals"]
                odds_applied = True

        if not odds_applied:
            if key in odds_by_match:
                match["odds"] = odds_by_match[key]["odds"]
                match["date"] = odds_by_match[key]["date"]
            elif rev_key in odds_by_match:
                # Swap home/away odds
                odds = odds_by_match[rev_key]["odds"]
                match["odds"] = {
                    "home": odds["away"],
                    "draw": odds["draw"],
                    "away": odds["home"]
                }
                if "totals" in odds:
                    match["odds"]["totals"] = odds["totals"]
                match["date"] = odds_by_match[rev_key]["date"]
            
        if key in scores_by_match:
            match["actual_score"] = scores_by_match[key]
        elif rev_key in scores_by_match:
            score = scores_by_match[rev_key]
            if score:
                match["actual_score"] = {
                    "home": score["away"],
                    "away": score["home"]
                }
                
    # Also add any new matches returned by the Odds API that aren't in our list (e.g. knockouts)
    existing_pairs = set(f"{normalize_team_name(m['home_team'])}:{normalize_team_name(m['away_team'])}" for m in data["matches"])
    
    if odds_json:
        next_id = max(int(m["id"]) for m in data["matches"]) + 1
        for match in odds_json:
            home = normalize_team_name(match.get("home_team"))
            away = normalize_team_name(match.get("away_team"))
            pair = f"{home}:{away}"
            
            if pair not in existing_pairs and f"{away}:{home}" not in existing_pairs:
                # This is a new match (likely knockout phase match)
                # Find stage based on current count/dates or standard names
                stage = "Knock-out Fase"
                # Set default odds
                h2h_odds = {"home": 2.2, "draw": 3.2, "away": 3.2}
                totals_odds = None
                bookmakers = match.get("bookmakers", [])
                if bookmakers:
                    markets = bookmakers[0].get("markets", [])
                    for market in markets:
                        market_key = market.get("key")
                        outcomes = market.get("outcomes", [])
                        if market_key == "h2h":
                            for outcome in outcomes:
                                name = outcome.get("name")
                                price = outcome.get("price")
                                if name == match.get("home_team"):
                                    h2h_odds["home"] = price
                                elif name == match.get("away_team"):
                                    h2h_odds["away"] = price
                                else:
                                    h2h_odds["draw"] = price
                        elif market_key == "totals":
                            over_odds = None
                            under_odds = None
                            point = None
                            for outcome in outcomes:
                                name = outcome.get("name")
                                price = outcome.get("price")
                                point = outcome.get("point")
                                if name == "Over":
                                    over_odds = price
                                elif name == "Under":
                                    under_odds = price
                            if over_odds is not None and under_odds is not None and point is not None:
                                totals_odds = {
                                    "line": point,
                                    "over": over_odds,
                                    "under": under_odds
                                }
                                
                match_odds = {
                    "home": h2h_odds["home"],
                    "draw": h2h_odds["draw"],
                    "away": h2h_odds["away"]
                }
                if totals_odds:
                    match_odds["totals"] = totals_odds
                else:
                    match_odds["totals"] = {"line": 2.5, "over": 1.9, "under": 1.9}
                    
                actual_score = scores_by_match.get(pair) or scores_by_match.get(f"{away}:{home}")
                if actual_score and pair not in scores_by_match: # it was reversed
                    actual_score = {"home": actual_score["away"], "away": actual_score["home"]}
                
                data["matches"].append({
                    "id": str(next_id),
                    "stage": stage,
                    "home_team": match.get("home_team"),
                    "away_team": match.get("away_team"),
                    "date": match.get("commence_time"),
                    "odds": match_odds,
                    "actual_score": actual_score,
                    "match_of_the_day": False,
                    "home_first_scorer": None,
                    "away_first_scorer": None
                })
                next_id += 1
                
    return data

def main():
    # Make sure data directory exists
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # Load existing or create default structure
    data = load_existing_data()
    
    # 1. Update match schedule & odds & scores
    data = update_odds_and_scores(data)
    
    # Force update match of the day status for all matches
    motd_schedule = {
        ("Mexico", "South Africa"): "2026-06-11",
        ("Brazil", "Morocco"): "2026-06-14",
        ("Japan", "Netherlands"): "2026-06-14",
        ("Belgium", "Egypt"): "2026-06-15",
        ("Croatia", "England"): "2026-06-17",
        ("Australia", "United States"): "2026-06-19",
        ("Netherlands", "Sweden"): "2026-06-20",
        ("Egypt", "New Zealand"): "2026-06-22",
        ("Algeria", "Jordan"): "2026-06-23",
        ("Colombia", "DR Congo"): "2026-06-24",
        ("Brazil", "Scotland"): "2026-06-25",
        ("Japan", "Sweden"): "2026-06-26",
        ("France", "Norway"): "2026-06-26",
        ("Spain", "Uruguay"): "2026-06-27"
    }
    
    for match in data["matches"]:
        home = normalize_team_name(match["home_team"])
        away = normalize_team_name(match["away_team"])
        pair = tuple(sorted([home, away]))
        match["match_of_the_day"] = pair in motd_schedule
    
    # 2. Scrape Wikipedia for stats
    wiki_url = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup"
    wiki_html = fetch_html(wiki_url)
    if wiki_html:
        data["stats"] = scrape_wikipedia(wiki_html, data["stats"])
        
    # Save back to file
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Data saved to {DATA_FILE}")
    except Exception as e:
        print(f"Error saving data: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
