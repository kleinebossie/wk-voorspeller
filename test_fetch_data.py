import json
import unittest
from unittest.mock import patch, MagicMock
import urllib.request
from fetch_data import fetch_json, fetch_html

class TestFetchData(unittest.TestCase):

    @patch('urllib.request.urlopen')
    def test_fetch_json_success(self, mock_urlopen):
        # Setup mock
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({"key": "value"}).encode('utf-8')
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        # Execute
        result = fetch_json("http://example.com/data.json")

        # Verify
        self.assertEqual(result, {"key": "value"})
        mock_urlopen.assert_called_once()

    @patch('urllib.request.urlopen')
    def test_fetch_json_failure(self, mock_urlopen):
        # Setup mock to raise an exception
        mock_urlopen.side_effect = Exception("Network error")

        # Execute
        result = fetch_json("http://example.com/data.json")

        # Verify
        self.assertIsNone(result)
        mock_urlopen.assert_called_once()

    @patch('urllib.request.urlopen')
    def test_fetch_html_success(self, mock_urlopen):
        # Setup mock
        mock_response = MagicMock()
        mock_response.read.return_value = "<html><body>Test</body></html>".encode('utf-8')
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        # Execute
        result = fetch_html("http://example.com/index.html")

        # Verify
        self.assertEqual(result, "<html><body>Test</body></html>")
        mock_urlopen.assert_called_once()

    @patch('urllib.request.urlopen')
    def test_fetch_html_failure(self, mock_urlopen):
        # Setup mock to raise an exception
        mock_urlopen.side_effect = Exception("Network error")

        # Execute
        result = fetch_html("http://example.com/index.html")

        # Verify
        self.assertIsNone(result)
        mock_urlopen.assert_called_once()

if __name__ == '__main__':
    unittest.main()
