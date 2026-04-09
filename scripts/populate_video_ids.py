import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HEADERS = {"User-Agent": "Mozilla/5.0"}
REQUEST_DELAY_SECONDS = 0.35
VIDEO_ID_RE = re.compile(r'"videoId":"([A-Za-z0-9_-]{11})"')
GAME_NAME_OVERRIDES = {
  "GTAV": ["GTA 5 Enhanced", "GTA V Enhanced", "Grand Theft Auto V Enhanced"],
  "GTAIV": ["GTA 4 Complete Edition", "GTA IV Complete Edition", "Grand Theft Auto IV The Complete Edition"],
  "GTASADE": ["GTA San Andreas Definitive Edition", "San Andreas Definitive Edition", "Grand Theft Auto San Andreas Definitive Edition"],
  "GTAVCDE": ["GTA Vice City Definitive Edition", "Vice City Definitive Edition", "Grand Theft Auto Vice City Definitive Edition"],
  "GTA3DE": ["GTA 3 Definitive Edition", "GTA III Definitive Edition", "Grand Theft Auto III Definitive Edition"]
}


def fetch(url):
  req = urllib.request.Request(url, headers=HEADERS)
  with urllib.request.urlopen(req, timeout=25) as response:
    payload = response.read().decode("utf-8", "ignore")
  time.sleep(REQUEST_DELAY_SECONDS)
  return payload


def load_manifest():
  return json.loads((ROOT / "data/games.json").read_text())


def get_game_entries(selected_game_ids):
  entries = []
  for manifest_entry in load_manifest():
    if selected_game_ids and manifest_entry["id"] not in selected_game_ids:
      continue
    path = ROOT / manifest_entry["file"].split("?")[0]
    game_data = json.loads(path.read_text())
    entries.append((manifest_entry, path, game_data))
  return entries


def candidate_queries(game_id, game_name, achievement):
  title = achievement["title"]
  names = GAME_NAME_OVERRIDES.get(game_id, [game_name])
  queries = []

  for name in names:
    queries.extend([
      f"{name} {title} achievement guide",
      f"{name} {title} guide",
      f"{name} {title} trophy guide",
      f"{name} {title}"
    ])

  description = achievement.get("description", "").strip().strip(".")
  if description:
    for name in names[:2]:
      queries.append(f"{name} {title} {description} achievement guide")

  deduped = []
  seen = set()
  for query in queries:
    if query not in seen:
      seen.add(query)
      deduped.append(query)

  return deduped


def resolve_video(game_id, game_name, achievement):
  seen_ids = set()

  for query in candidate_queries(game_id, game_name, achievement):
    try:
      html = fetch(f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}&hl=en")
    except Exception:
      continue

    candidates = []
    for video_id in VIDEO_ID_RE.findall(html):
      if video_id in seen_ids:
        continue
      seen_ids.add(video_id)
      candidates.append(video_id)
      if len(candidates) >= 8:
        break

    for video_id in candidates:
      try:
        oembed_raw = fetch(f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json")
      except Exception:
        continue

      oembed = json.loads(oembed_raw)
      return {
        "videoId": video_id,
        "videoUrl": f"https://www.youtube.com/watch?v={video_id}",
        "videoTitle": oembed.get("title", ""),
        "videoChannel": oembed.get("author_name", "")
      }

  return None


def save_game(path, game_data):
  path.write_text(json.dumps(game_data, indent=2, ensure_ascii=True) + "\n")


def process_game(manifest_entry, path, game_data, workers):
  pending = [achievement for achievement in game_data.get("achievements", []) if not achievement.get("videoId")]
  print(f"{manifest_entry['id']}: pending {len(pending)}")

  if not pending:
    return []

  resolved = {}
  failures = []
  with ThreadPoolExecutor(max_workers=workers) as executor:
    futures = {
      executor.submit(resolve_video, manifest_entry["id"], manifest_entry["name"], achievement): achievement["title"]
      for achievement in pending
    }
    total = len(futures)
    completed = 0

    for future in as_completed(futures):
      title = futures[future]
      completed += 1
      try:
        result = future.result()
      except Exception:
        result = None

      if result is None:
        failures.append(title)
        print(f"[{manifest_entry['id']}] FAIL {title}")
      else:
        resolved[title] = result
        for achievement in game_data.get("achievements", []):
          if achievement["title"] == title:
            achievement.update(result)
            break
        save_game(path, game_data)
        print(f"[{manifest_entry['id']}] {title} -> {result['videoId']}")

      if completed % 10 == 0 or completed == total:
        print(f"[{manifest_entry['id']}] progress {completed}/{total} failures={len(failures)}")
        sys.stdout.flush()

  save_game(path, game_data)
  print(f"{manifest_entry['id']}: wrote {path.name}, failures={len(failures)}")
  if failures:
    print(f"FAILURES {manifest_entry['id']}: {json.dumps(failures)}")

  return failures


def parse_args():
  parser = argparse.ArgumentParser()
  parser.add_argument("--game", action="append", dest="games", help="Manifest game id to process, can be repeated")
  parser.add_argument("--workers", type=int, default=1, help="Concurrent workers to use per game")
  return parser.parse_args()


def main():
  args = parse_args()
  failures = {}
  for manifest_entry, path, game_data in get_game_entries(set(args.games or [])):
    failures[manifest_entry["id"]] = process_game(manifest_entry, path, game_data, max(1, args.workers))

  unresolved = {game_id: items for game_id, items in failures.items() if items}
  if unresolved:
    print(json.dumps(unresolved, indent=2))
    sys.exit(1)


if __name__ == "__main__":
  main()