#!/usr/bin/env python3
"""Build a compact UI translation dictionary from the client's original string table.

It scans our source for user-facing English strings, matches them against the English
column of `string_table.json`, and emits translations for the selected languages.
Strings without an exact match are simply left in English at runtime.
"""
import json, re, glob
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "app/src"
TABLE = Path.home() / "Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/Game/assets/languages/string_table.json"
OUT = SRC / "lib/i18n-dict.json"

LANGS = [
    ("en", "English"), ("ro", "Română"), ("de", "Deutsch"), ("fr", "Français"),
    ("es", "Español"), ("pt-br", "Português"), ("ru", "Русский"), ("zh-cn", "中文"),
    ("ja", "日本語"), ("ko", "한국어"), ("tr", "Türkçe"), ("pl", "Polski"),
]

# Extra mappings for strings that are not exact matches but have an obvious original key.
MANUAL = {
    "Tournaments": "TourneyTitle",
    "Slots": "Slots",
    "Poker": "Poker",
    "Join": "LobbyButtonJoinTable",
    "Open": "HoldemGeneralTableOpenButton",
    "My Page": "MobileMyPage",
    "Missions": "MobileMissionMission",
    "Leaders": "MenuLeaderBoard",
    "Promotions": "Promotions",
    "Settings": "SettingsLabel",
    "Profile": "MyProfile",
    "Home": "LobbyHomepage",
    "Hand History": "HandHistory",
    "Cashier": "ButtonCashier",
    "Rewards": "Rewards",
    "Deposit": "Deposit",
    "Withdraw": "Withdraw",
    "Tournament": "TourneyTitle",
    "Leaderboard": "MenuLeaderBoard",
    "Sit out": "TablePlayerInfoSittingOut",
    "Time bank": "OptionTabTimeBank",
    "Rebuy": "TourneyRebuyTitle",
}

# Short/overridden Romanian labels for strings the original table does not cover.
MANUAL_RO = {
    "All stakes": "Toate mizele", "All seats": "Toate locurile", "All speeds": "Toate vitezele",
    "Search tables…": "Caută mese…", "Favorites": "Favorite", "Missions": "Misiuni",
    "Group View": "Grup", "Table View": "Masă", "My Promo": "Promoțiile mele",
    "★ Favorites": "★ Favorite",
    "Total Pot :": "Pot total :",
    "Buy-in Range": "Interval de cumpărare",
    "Take a seat": "Ia un loc",
    "Open seat": "Loc liber",
    "Pop out": "Fereastră nouă",
    "Menu": "Meniu",
    "Connected": "Conectat",
    "Rabbit hunt": "Vânătoare de iepuri",
    "Sit out next hand": "Stai afară următoarea mână",
    "Post blinds / sit in": "Plătește blindurile / intră în joc",
    "Rebuy / add chips": "Recumpărare / adaugă jetoane",
    "Auto rebuy": "Recumpărare automată",
    "Four-colour deck": "Pachet cu patru culori",
    "Disable animations": "Oprește animațiile",
    "Enable animations": "Pornește animațiile",
    "Table settings": "Setări masă",
    "You are observing this table. Take a seat to join the action.": "Urmărești această masă. Ia un loc pentru a intra în joc.",
}


def candidates():
    text = ""
    for f in list(SRC.glob("**/*.tsx")) + list(SRC.glob("**/*.ts")):
        text += f.read_text(errors="ignore") + "\n"
    out = set()
    for m in re.finditer(r'"([^"\n]{2,60})"', text):
        out.add(m.group(1).strip())
    for m in re.finditer(r"'([^'\n]{2,60})'", text):
        out.add(m.group(1).strip())
    for m in re.finditer(r'>([^<>{}\n]{2,60})<', text):
        out.add(m.group(1).strip())
    out = {s for s in out if s and len(s) <= 60 and not s.startswith(("/", ".", "http", "data:", "{", "("))}
    return out


def main():
    table = json.load(open(TABLE, encoding="utf-8-sig"))
    rev = {}
    for key, vals in table.items():
        en = (vals.get("en") or "").strip()
        if en:
            rev.setdefault(en.lower(), key)
    out = {}
    for s in candidates():
        key = rev.get(s.lower())
        if not key:
            continue
        vals = table[key]
        langs = {code: (vals.get(code) or vals.get("en") or s) for code, _ in LANGS}
        out[s] = langs
    for s, key in MANUAL.items():
        if s in out:
            continue
        vals = table.get(key)
        if not vals:
            continue
        langs = {code: (vals.get(code) or vals.get("en") or s) for code, _ in LANGS}
        out[s] = langs
    for s, ro in MANUAL_RO.items():
        out.setdefault(s, {code: s for code, _ in LANGS})
        out[s]["ro"] = ro
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0))
    print("strings:", len(out), "size:", OUT.stat().st_size)


if __name__ == "__main__":
    main()
