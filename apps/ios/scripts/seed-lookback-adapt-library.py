#!/usr/bin/env python3
"""Seed sparse, far-day, and multi-year moments for lookback adapt walks.

Does not delete existing personal rows. Family tables are untouched.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SAMPLE = {
    "schemaVersion": 1,
    "revision": 1,
    "ownerId": "local-user",
    "content": {"note": "", "significance": "", "emotion": ""},
    "time": {
        "occurredAtPrecision": "day",
        "recordedAt": "",
        "occurredAt": "",
        "timezone": "Asia/Shanghai",
    },
    "assetIds": [],
    "context": {"people": [], "tags": []},
    "origin": {"type": "created"},
    "accessSummary": {"visibility": "private", "futureAccessEnabled": False},
    "lifecycle": {"status": "active", "activatedAt": ""},
    "audit": {"createdAt": "", "updatedAt": ""},
}


def shanghai_day(year: int, month: int, day: int) -> str:
    # 12:00 Asia/Shanghai, safely inside that civil day.
    return datetime(year, month, day, 4, 0, tzinfo=timezone.utc).isoformat().replace("+00:00", ".000Z")


def moment(moment_id: str, note: str, year: int, month: int, day: int) -> dict:
    occurred = shanghai_day(year, month, day)
    recorded = occurred
    rec = json.loads(json.dumps(SAMPLE))
    rec["id"] = moment_id
    rec["content"]["note"] = note
    rec["time"]["recordedAt"] = recorded
    rec["time"]["occurredAt"] = occurred
    rec["lifecycle"]["activatedAt"] = recorded
    rec["audit"]["createdAt"] = recorded
    rec["audit"]["updatedAt"] = recorded
    return rec


def upsert(cur: sqlite3.Cursor, rec: dict) -> None:
    payload = (
        rec["id"],
        rec["ownerId"],
        "active",
        rec["time"]["recordedAt"],
        rec["time"]["occurredAt"],
        json.dumps(rec, ensure_ascii=False),
    )
    existing = cur.execute("SELECT id FROM moments WHERE id = ?", (rec["id"],)).fetchone()
    if existing:
        cur.execute(
            "UPDATE moments SET owner_id=?, lifecycle_status=?, recorded_at=?, occurred_at=?, json=? WHERE id=?",
            (payload[1], payload[2], payload[3], payload[4], payload[5], payload[0]),
        )
        return
    cur.execute(
        "INSERT INTO moments (id, owner_id, lifecycle_status, recorded_at, occurred_at, json) VALUES (?,?,?,?,?,?)",
        payload,
    )


def seed(db_path: Path) -> int:
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    count = 0
    upsert(cur, moment("moment_adapt_sparse", "稀疏月一条", 2025, 4, 8))
    count += 1
    for day in range(1, 29):
        upsert(cur, moment(f"moment_adapt_far_{day:02d}", f"远处换日第{day}天", 2023, 8, day))
        count += 1
    for year in range(2018, 2023):
        for month in range(1, 7):
            for day in (1, 8, 15, 22):
                upsert(
                    cur,
                    moment(
                        f"moment_adapt_{year}_{month:02d}_{day:02d}",
                        f"{year}年{month}月{day}日",
                        year,
                        month,
                        day,
                    ),
                )
                count += 1
    con.commit()
    con.close()
    return count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db")
    args = parser.parse_args()
    written = seed(Path(args.db))
    print(f"seeded {written} walk moments")


if __name__ == "__main__":
    main()
