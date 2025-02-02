# rss_to_char

# News Aggregator and Summarizer

This project automates the process of collecting news from an RSS feed, extracting their content, storing the data in a local SQLite database, and generating summaries using OpenAI's API. The summaries are then used to populate a JSON character file for Eliza.

---

## Prerequisites

Before running the scripts, ensure you have the following:

1. **Node.js** installed on your system.
2. An **OpenAI API key**.
3. An **RSS feed URL** (e.g., from [Google Alerts](https://google.com/alerts)).

---

## Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd <repository-folder>
   
2. **Install dependencies:**:
   ```bash
   npm install
2. **Setup .env:**:
   ```bash
   cp env.example .env
   ```
   edit .env
   ```bash
   RSS_FEED=your_google_alerts_rss_feed_url
   OPENAI_API_KEY=your_openai_api_key`   
   ```
## Usage

1. Run `spider.js` to:
   - Fetch news from the feed
   - Extract text content
   - Populate the local SQLite database
   ```bash
   node spider.js
   ```
2. Run `teacher.js` to:

   -   Generate content summaries using OpenAI
   -   Update Eliza's character JSON file
   ```bash
   node teacher.js my_character.json
   ```
