import unittest
from fetch_data import normalize_team_name, generate_default_matches, scrape_wikipedia

class TestFetchData(unittest.TestCase):
    def test_normalize_team_name(self):
        self.assertEqual(normalize_team_name("usa"), "United States")
        self.assertEqual(normalize_team_name("south korea"), "South Korea")
        self.assertEqual(normalize_team_name("czech republic"), "Czechia")
        self.assertEqual(normalize_team_name("Unknown Team"), "Unknown Team")
        self.assertEqual(normalize_team_name(""), "")
        self.assertEqual(normalize_team_name(None), "")

    def test_generate_default_matches(self):
        matches = generate_default_matches()
        # 12 groups * 6 matches per group = 72 matches
        self.assertEqual(len(matches), 72)

        # Check first match structure
        first_match = matches[0]
        required_keys = ["id", "stage", "home_team", "away_team", "date", "odds", "actual_score", "match_of_the_day"]
        for key in required_keys:
            self.assertIn(key, first_match)

        # Verify IDs are sequential
        ids = [int(m["id"]) for m in matches]
        self.assertEqual(ids, list(range(1, 73)))

    def test_scrape_wikipedia(self):
        mock_html = """
        <html>
            <body>
                <p>The first goal of the tournament was scored by John Doe. It was in the 12th minute.</p>
                <p>The first yellow card was given in the 25th minute.</p>
                <p>The first red card was given in the 88th minute.</p>
                <h3>4 goals</h3>
                <ul>
                    <li><a href="#">Player One</a></li>
                    <li><a href="#">Player Two</a></li>
                </ul>
                <table>
                    <tr><th>Champions</th><td class="foobar"><b><a href="#">Brazil</a></b></td></tr>
                </table>
            </body>
        </html>
        """
        initial_stats = {
            "first_yellow_card_minute": None,
            "first_red_card_minute": None,
            "first_goal_minute": None,
            "first_goal_scorer": None,
            "topscorer": None,
            "knockout": {"champion": None}
        }

        stats = scrape_wikipedia(mock_html, initial_stats)

        self.assertEqual(stats["first_goal_minute"], 12)
        self.assertEqual(stats["first_goal_scorer"], "John Doe")
        self.assertEqual(stats["first_yellow_card_minute"], 25)
        self.assertEqual(stats["first_red_card_minute"], 88)
        self.assertEqual(stats["topscorer"], "Player One")
        self.assertEqual(stats["knockout"]["champion"], "Brazil")

    def test_scrape_wikipedia_missing_info(self):
        mock_html = "<html><body>Nothing here</body></html>"
        initial_stats = {
            "first_yellow_card_minute": None,
            "first_red_card_minute": None,
            "first_goal_minute": None,
            "first_goal_scorer": None,
            "topscorer": None,
            "knockout": {"champion": None}
        }

        stats = scrape_wikipedia(mock_html, initial_stats)
        self.assertIsNone(stats["first_goal_minute"])
        self.assertIsNone(stats["first_goal_scorer"])
        self.assertIsNone(stats["knockout"]["champion"])

if __name__ == '__main__':
    unittest.main()
