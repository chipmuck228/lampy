#!/usr/bin/env python3
"""Create a disposable lookback-adapt fixture library. Never writes a live lampy.db.

Isolation is the file, not “keep existing personal rows”:
- path basename must be lookback-adapt.db
- new file gets lookback_adapt_fixture.token = lookback-adapt-v1
- existing file must already have that token and zero moments
- INSERT only; never UPDATE a Moment

Copy the resulting file onto a disposable install as Documents/SQLite/lampy.db
only when that destination does not exist. Do not point this script at a
personal Application container.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

FIXTURE_BASENAME = "lookback-adapt.db"
FIXTURE_TABLE = "lookback_adapt_fixture"
FIXTURE_TOKEN = "lookback-adapt-v1"
EXPECTED_COUNT = 149
OWNER_ID = "local-user"

MOMENTS_SCHEMA = """
CREATE TABLE IF NOT EXISTS moments (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    occurred_at TEXT,
    json TEXT NOT NULL
);
"""

IDENTITY_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS {FIXTURE_TABLE} (
    token TEXT PRIMARY KEY NOT NULL
);
"""

SAMPLE = {
    "schemaVersion": 1,
    "revision": 1,
    "ownerId": OWNER_ID,
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


class SeedRefused(Exception):
    pass


def shanghai_day(year: int, month: int, day: int) -> str:
    return datetime(year, month, day, 4, 0, tzinfo=timezone.utc).isoformat().replace("+00:00", ".000Z")


def moment(moment_id: str, note: str, year: int, month: int, day: int) -> dict:
    occurred = shanghai_day(year, month, day)
    rec = json.loads(json.dumps(SAMPLE))
    rec["id"] = moment_id
    rec["content"]["note"] = note
    rec["time"]["recordedAt"] = occurred
    rec["time"]["occurredAt"] = occurred
    rec["lifecycle"]["activatedAt"] = occurred
    rec["audit"]["createdAt"] = occurred
    rec["audit"]["updatedAt"] = occurred
    return rec


def walk_moments() -> list[dict]:
    rows = [moment("moment_adapt_sparse", "稀疏月一条", 2025, 4, 8)]
    for day in range(1, 29):
        rows.append(moment(f"moment_adapt_far_{day:02d}", f"远处换日第{day}天", 2023, 8, day))
    for year in range(2018, 2023):
        for month in range(1, 7):
            for day in (1, 8, 15, 22):
                rows.append(
                    moment(
                        f"moment_adapt_{year}_{month:02d}_{day:02d}",
                        f"{year}年{month}月{day}日",
                        year,
                        month,
                        day,
                    )
                )
    return rows


def assert_allowed_path(db_path: Path) -> None:
    if db_path.name != FIXTURE_BASENAME:
        raise SeedRefused(
            f"refuse: only a disposable file named {FIXTURE_BASENAME} is allowed, not {db_path.name}"
        )
    parts = [part.lower() for part in db_path.parts]
    if "documents" in parts and "sqlite" in parts and db_path.name == "lampy.db":
        raise SeedRefused("refuse: will not write a live install lampy.db")


def table_exists(cur: sqlite3.Cursor, name: str) -> bool:
    row = cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    return row is not None


def read_identity(cur: sqlite3.Cursor) -> str | None:
    if not table_exists(cur, FIXTURE_TABLE):
        return None
    row = cur.execute(f"SELECT token FROM {FIXTURE_TABLE} LIMIT 1").fetchone()
    return str(row[0]) if row else None


def moment_count(cur: sqlite3.Cursor) -> int:
    if not table_exists(cur, "moments"):
        return 0
    return int(cur.execute("SELECT COUNT(*) FROM moments").fetchone()[0])


def insert_moment(cur: sqlite3.Cursor, rec: dict) -> None:
    cur.execute(
        "INSERT INTO moments (id, owner_id, lifecycle_status, recorded_at, occurred_at, json) VALUES (?,?,?,?,?,?)",
        (
            rec["id"],
            rec["ownerId"],
            "active",
            rec["time"]["recordedAt"],
            rec["time"]["occurredAt"],
            json.dumps(rec, ensure_ascii=False),
        ),
    )


def prepare_new_fixture(cur: sqlite3.Cursor) -> None:
    cur.execute(MOMENTS_SCHEMA)
    cur.execute(IDENTITY_SCHEMA)
    cur.execute(f"INSERT INTO {FIXTURE_TABLE} (token) VALUES (?)", (FIXTURE_TOKEN,))


def assert_existing_fixture_empty(cur: sqlite3.Cursor) -> None:
    token = read_identity(cur)
    if token != FIXTURE_TOKEN:
        raise SeedRefused("refuse: missing or mismatched fixture identity")
    if moment_count(cur) > 0:
        raise SeedRefused("refuse: fixture already has moments; will not update or append")


def seed(db_path: Path) -> int:
    assert_allowed_path(db_path)
    existed = db_path.exists()
    if existed and not db_path.is_file():
        raise SeedRefused(f"refuse: {db_path} is not a file")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    created = not existed
    ok = False
    con = sqlite3.connect(db_path)
    try:
        cur = con.cursor()
        if existed:
            assert_existing_fixture_empty(cur)
        else:
            prepare_new_fixture(cur)
        rows = walk_moments()
        for rec in rows:
            insert_moment(cur, rec)
        con.commit()
        ok = True
        return len(rows)
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()
        if created and not ok and db_path.exists():
            db_path.unlink()


def self_test() -> None:
    root = Path(tempfile.mkdtemp(prefix="lookback-adapt-seed-"))
    try:
        lampy = root / "lampy.db"
        try:
            seed(lampy)
            raise AssertionError("lampy.db must be refused")
        except SeedRefused as err:
            assert "lookback-adapt.db" in str(err)
        assert not lampy.exists()

        personal = root / "personal" / FIXTURE_BASENAME
        personal.parent.mkdir()
        con = sqlite3.connect(personal)
        con.execute(MOMENTS_SCHEMA)
        con.execute(
            "INSERT INTO moments (id, owner_id, lifecycle_status, recorded_at, occurred_at, json) VALUES (?,?,?,?,?,?)",
            ("personal_keep", OWNER_ID, "active", "2026-09-01T04:00:00.000Z", "2026-09-01T04:00:00.000Z", "{}"),
        )
        con.commit()
        con.close()
        try:
            seed(personal)
            raise AssertionError("non-empty library without identity must be refused")
        except SeedRefused as err:
            assert "identity" in str(err)
        personal_con = sqlite3.connect(personal)
        kept = personal_con.execute("SELECT id, json FROM moments").fetchall()
        personal_con.close()
        assert kept == [("personal_keep", "{}")]

        fresh = root / "fresh" / FIXTURE_BASENAME
        written = seed(fresh)
        assert written == EXPECTED_COUNT
        con = sqlite3.connect(fresh)
        assert read_identity(con.cursor()) == FIXTURE_TOKEN
        assert moment_count(con.cursor()) == EXPECTED_COUNT
        con.close()

        try:
            seed(fresh)
            raise AssertionError("second seed on a non-empty fixture must be refused")
        except SeedRefused as err:
            assert "moments" in str(err)
        assert sqlite3.connect(fresh).execute("SELECT COUNT(*) FROM moments").fetchone()[0] == EXPECTED_COUNT

        wrong = root / "wrong" / FIXTURE_BASENAME
        wrong.parent.mkdir()
        con = sqlite3.connect(wrong)
        con.execute(MOMENTS_SCHEMA)
        con.execute(IDENTITY_SCHEMA)
        con.execute(f"INSERT INTO {FIXTURE_TABLE} (token) VALUES (?)", ("not-the-fixture",))
        con.commit()
        con.close()
        try:
            seed(wrong)
            raise AssertionError("mismatched identity must be refused")
        except SeedRefused as err:
            assert "identity" in str(err)
        assert sqlite3.connect(wrong).execute("SELECT COUNT(*) FROM moments").fetchone()[0] == 0

        empty = root / "empty" / FIXTURE_BASENAME
        empty.parent.mkdir()
        con = sqlite3.connect(empty)
        con.execute(MOMENTS_SCHEMA)
        con.execute(IDENTITY_SCHEMA)
        con.execute(f"INSERT INTO {FIXTURE_TABLE} (token) VALUES (?)", (FIXTURE_TOKEN,))
        con.commit()
        con.close()
        assert seed(empty) == EXPECTED_COUNT

        con = sqlite3.connect(":memory:")
        con.execute(MOMENTS_SCHEMA)
        insert_moment(con.cursor(), moment("moment_adapt_sparse", "original", 2025, 4, 8))
        con.commit()
        try:
            insert_moment(con.cursor(), moment("moment_adapt_sparse", "changed", 2025, 4, 8))
            raise AssertionError("INSERT must not replace an existing Moment")
        except sqlite3.IntegrityError:
            pass
        note = json.loads(con.execute("SELECT json FROM moments WHERE id=?", ("moment_adapt_sparse",)).fetchone()[0])
        assert note["content"]["note"] == "original"
        con.close()
    finally:
        for child in sorted(root.rglob("*"), reverse=True):
            if child.is_file():
                child.unlink()
            elif child.is_dir():
                child.rmdir()
        root.rmdir()
    print("self-test ok")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an isolated lookback-adapt fixture library.")
    parser.add_argument(
        "db",
        nargs="?",
        help=f"path whose basename must be {FIXTURE_BASENAME}",
    )
    parser.add_argument("--self-test", action="store_true", help="refuse/insert checks without touching a real install")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.db:
        parser.error(f"provide a {FIXTURE_BASENAME} path, or --self-test")
    try:
        written = seed(Path(args.db))
    except SeedRefused as err:
        print(err, file=sys.stderr)
        return 2
    print(f"seeded {written} walk moments into disposable fixture")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
