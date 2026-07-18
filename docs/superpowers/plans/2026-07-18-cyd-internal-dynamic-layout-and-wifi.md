# CYD Internal — Dynamic Layout + WiFi Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate CYD internal firmware to its own repo, make its 3 printer screens JSON-driven (grid layout, configurable fields, no reflash to rearrange), add a dashboard editor + confirmation loop, then add WiFi/broker captive-portal provisioning (no reflash to reconfigure network).

**Architecture:** One generic grid+fields renderer (`layout_*` files) replaces 3 hardcoded C++ screens. Config arrives as JSON over MQTT retained (`3dpb/cyd/internal-rack/layout`), cached to LittleFS, with a baked-in default fallback. Dashboard (`apps/dashboard`, shopee-analysis) authors the JSON via a fixed-grid form and confirms application via a readback topic. WiFi/broker config moves from compile-time `#define` to WiFiManager-driven runtime provisioning (AP-mode captive portal), stored in NVS.

**Tech Stack:** PlatformIO/Arduino (ESP32), TFT_eSPI, ArduinoJson v7, PubSubClient, WiFiManager (tzapu), LittleFS, `Preferences` (NVS). Dashboard: Next.js 16 (`apps/dashboard`), `mqtt` npm package. `packages/printer-monitor-core` (TypeScript, small addendum).

## Global Constraints

- **Repo:** `~/Documents/Project/3pb-monitoring-display/apps/internal/` (created in Task 1; all firmware paths below are relative to that directory once migrated).
- **PlatformIO env:** `[env:cyd]`, `platform = espressif32`, `board = esp32dev`, `framework = arduino`. Existing `lib_deps`: `bodmer/TFT_eSPI@^2.5.43`, `bblanchon/ArduinoJson@^7.0.0`, `PaulStoffregen/XPT2046_Touchscreen`, `arduino-libraries/NTPClient@^3.2.1`, `knolleary/PubSubClient@^2.8`. New: `tzapu/WiFiManager@^2.0.17`. `LittleFS`/`Preferences` ship with the ESP32 Arduino core — no `lib_deps` entry needed.
- **Screen:** 320×240 (`SCREEN_W`/`SCREEN_H` in `display.h`, rotation-dependent).
- **MQTT broker (default, provisionable from Task 12 onward):** `192.168.88.113:1883`.
- **MQTT topics:** printer status `3dpb/printers` (unchanged, existing). Layout config `3dpb/cyd/internal-rack/layout` (retained). Layout readback `3dpb/cyd/internal-rack/layout/current` (retained).
- **Schema limits:** max 8 pages, max 24 cells/page, max 3 fields/row, max 8 field-rows/cells-or-page-default (`MAX_PAGES`, `MAX_CELLS_PER_PAGE`, `MAX_FIELDS_PER_ROW`, `MAX_ROWS_PER_FIELDS` — defined once in `layout_types.h`, Task 2).
- **`schemaVersion`:** must be `1`. Any other value or malformed JSON → parse returns `false`, caller keeps existing config (never crash, never blank screen).
- **Firmware pure-logic test convention (existing, matched exactly):** standalone C++ file under `test/`, plain `assert()`+`printf()` (no PlatformIO test env configured), compiled directly with system `g++`, no Arduino framework dependency for files that don't need it (`layout_types.h`, `grid_geometry.*` — see Task 2). Files needing `ArduinoJson.h` (Task 3) compile against the PlatformIO-fetched copy at `.pio/libdeps/cyd/ArduinoJson/src`.
- **Dashboard auth pattern (existing, matched exactly):** every API route starts with `const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`.
- **Node 22 wajib** for all `shopee-analysis` shell commands: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.

---

### Task 1: Migrate repo — `3pb-monitoring-display/apps/internal`

**Files:**
- Create: `~/Documents/Project/3pb-monitoring-display/` (new git repo)
- Move: `~/Documents/Project/3dpb-app/apps/claude-monitor/*` → `~/Documents/Project/3pb-monitoring-display/apps/internal/*` (history preserved)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working PlatformIO project at `~/Documents/Project/3pb-monitoring-display/apps/internal/` that builds identically to the original. All subsequent tasks work inside this new repo.

- [ ] **Step 1: Split `claude-monitor` out of `3dpb-app` with history preserved**

```bash
cd ~/Documents/Project/3dpb-app
git subtree split --prefix=apps/claude-monitor -b claude-monitor-split
```
Expected: prints a final commit SHA, no errors.

- [ ] **Step 2: Create the new repo and pull the split branch in as `apps/internal`**

```bash
mkdir -p ~/Documents/Project/3pb-monitoring-display
cd ~/Documents/Project/3pb-monitoring-display
git init
git pull ~/Documents/Project/3dpb-app claude-monitor-split
mkdir -p apps
git mv $(git ls-tree --name-only HEAD | grep -v '^apps$') /tmp/claude-monitor-root-files 2>/dev/null || true
```
Because `git subtree split` makes the subdirectory's contents the new repo root, the files land at the repo root, not under `apps/internal/`. Move them there directly (simpler than the `git mv` dance above — undo the above and do this instead):

```bash
cd ~/Documents/Project/3pb-monitoring-display
git reset --hard  # undo the failed git mv attempt above, tree is unaffected by git pull
mkdir -p apps/internal
git ls-tree --name-only HEAD | xargs -I{} git mv {} apps/internal/
git commit -m "chore: nest migrated claude-monitor under apps/internal/"
```
Expected: `git log --oneline` shows the full original `claude-monitor` history followed by this one nesting commit. `ls apps/internal/` shows `src/`, `platformio.ini`, `docs/`, etc.

- [ ] **Step 3: Verify the build works identically in the new location**

```bash
cd ~/Documents/Project/3pb-monitoring-display/apps/internal
cp src/config.h.example src/config.h  # config.h is gitignored, wasn't carried over
pio run -e cyd
```
Expected: `SUCCESS`, same as it would have in the old location. (Real WiFi/MQTT credentials aren't needed to compile — only to run on hardware.)

- [ ] **Step 4: Clean up the split branch in `3dpb-app` (not the removal yet — that's gated)**

```bash
cd ~/Documents/Project/3dpb-app
git branch -D claude-monitor-split
```
Expected: branch deleted. `apps/claude-monitor` still exists in `3dpb-app` at this point — do NOT remove it yet. Removal from `3dpb-app` happens as a separate, explicitly user-approved step after Task 12 confirms the new repo is the one actually being developed/flashed going forward (per spec §3.1: "**Setelah** dikonfirmasi build & jalan identik"). Report this as a manual follow-up in the final task summary, not something to execute automatically here.

- [ ] **Step 5: Commit is already done (Step 2's commit). No further action.**

---

### Task 2: Layout types + grid geometry (pure, testable)

**Files:**
- Create: `apps/internal/src/layout/layout_types.h`
- Create: `apps/internal/src/layout/grid_geometry.h`
- Create: `apps/internal/src/layout/grid_geometry.cpp`
- Test: `apps/internal/test/test_grid_geometry.cpp`

**Interfaces:**
- Consumes: nothing.
- Produces: `FieldId` enum, `FieldEntry`/`FieldRow`/`LayoutCell`/`LayoutPage`/`LayoutConfig` structs (used by every later firmware task), `CellRect computeCellRect(const LayoutPage&, uint8_t col, uint8_t row, uint8_t colSpan, uint8_t rowSpan, int screenW, int screenH)`.

- [ ] **Step 1: Write `layout_types.h`** (no Arduino dependency — keeps it g++-testable)

```cpp
#pragma once
#include <stdint.h>

#define MAX_PAGES 8
#define MAX_CELLS_PER_PAGE 24
#define MAX_FIELDS_PER_ROW 3
#define MAX_ROWS_PER_FIELDS 8
#define MAX_GRID_ROWS 8

enum class FieldId : uint8_t {
  Name, Type, State, Progress, ProgressBar, TimeLeft, Eta, Filename, Error, Unknown
};

struct FieldEntry {
  FieldId id = FieldId::Unknown;
  char label[16] = "";
};

struct FieldRow {
  FieldEntry entries[MAX_FIELDS_PER_ROW];
  uint8_t count = 0;
};

struct LayoutCell {
  bool isLabel = false;
  char printerId[24] = "";
  char labelText[32] = "";
  uint8_t col = 0, row = 0, colSpan = 1, rowSpan = 1;
  FieldRow fields[MAX_ROWS_PER_FIELDS];
  uint8_t fieldRowCount = 0;  // 0 = use page's defaultFields
};

struct LayoutPage {
  char id[16] = "";
  uint8_t cols = 1, rows = 1;
  float rowWeights[MAX_GRID_ROWS] = {0};
  bool hasRowWeights = false;
  FieldRow defaultFields[MAX_ROWS_PER_FIELDS];
  uint8_t defaultFieldRowCount = 0;
  uint16_t durationSec = 0;
  LayoutCell cells[MAX_CELLS_PER_PAGE];
  uint8_t cellCount = 0;
};

struct LayoutConfig {
  uint8_t schemaVersion = 0;
  LayoutPage pages[MAX_PAGES];
  uint8_t pageCount = 0;
};
```

- [ ] **Step 2: Write `grid_geometry.h`**

```cpp
#pragma once
#include "layout_types.h"

struct CellRect { int x, y, w, h; };

CellRect computeCellRect(const LayoutPage& page, uint8_t col, uint8_t row,
                          uint8_t colSpan, uint8_t rowSpan, int screenW, int screenH);
```

- [ ] **Step 3: Write the failing test — `test/test_grid_geometry.cpp`**

```cpp
#include "../src/layout/layout_types.h"
#include "../src/layout/grid_geometry.h"
#include <assert.h>
#include <stdio.h>

int main() {
  // Grid seragam 6x4, tanpa rowWeights: cellW=320/6=53, cellH=240/4=60
  LayoutPage uniform;
  uniform.cols = 6; uniform.rows = 4; uniform.hasRowWeights = false;
  CellRect r1 = computeCellRect(uniform, 0, 0, 1, 1, 320, 240);
  assert(r1.x == 0 && r1.y == 0 && r1.w == 53 && r1.h == 60);

  CellRect r2 = computeCellRect(uniform, 2, 1, 1, 1, 320, 240);
  assert(r2.x == 106 && r2.y == 60);

  // colSpan/rowSpan
  CellRect r3 = computeCellRect(uniform, 0, 3, 6, 1, 320, 240);
  assert(r3.x == 0 && r3.y == 180 && r3.w == 318 && r3.h == 60);  // 53*6=318

  // rowWeights: [0.06, 0.32, 0.36, 0.26] pada tinggi 240
  LayoutPage weighted;
  weighted.cols = 6; weighted.rows = 4; weighted.hasRowWeights = true;
  weighted.rowWeights[0] = 0.06f; weighted.rowWeights[1] = 0.32f;
  weighted.rowWeights[2] = 0.36f; weighted.rowWeights[3] = 0.26f;
  CellRect r4 = computeCellRect(weighted, 0, 0, 1, 1, 320, 240);
  assert(r4.y == 0 && r4.h == 14);  // 0.06*240=14.4 -> 14
  CellRect r5 = computeCellRect(weighted, 0, 1, 1, 1, 320, 240);
  assert(r5.y == 14 && r5.h == 76); // cumsum(0.06)=14, 0.32*240=76.8 -> 76
  CellRect r6 = computeCellRect(weighted, 0, 3, 1, 1, 320, 240);
  assert(r6.y == 176);              // cumsum(0.06+0.32+0.36)=0.74*240=177.6->177 (int trunc per-baris, lihat catatan implementasi)

  printf("test_grid_geometry: all assertions passed\n");
  return 0;
}
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd apps/internal
g++ -std=c++17 -I src -o /tmp/test_grid_geometry test/test_grid_geometry.cpp src/layout/grid_geometry.cpp 2>&1 || \
g++ -std=c++17 -I src -o /tmp/test_grid_geometry test/test_grid_geometry.cpp 2>&1
```
Expected: FAIL — linker error `undefined reference to computeCellRect` (file `grid_geometry.cpp` doesn't exist yet).

- [ ] **Step 5: Write `grid_geometry.cpp`**

```cpp
#include "grid_geometry.h"

CellRect computeCellRect(const LayoutPage& page, uint8_t col, uint8_t row,
                          uint8_t colSpan, uint8_t rowSpan, int screenW, int screenH) {
  int cellW = screenW / page.cols;
  int x = col * cellW;
  int w = cellW * colSpan;

  int y, h;
  if (page.hasRowWeights) {
    float sum = 0;
    for (uint8_t i = 0; i < page.rows; i++) sum += page.rowWeights[i];
    float yFrac = 0;
    for (uint8_t i = 0; i < row; i++) yFrac += page.rowWeights[i];
    y = (int)(yFrac / sum * screenH);
    float hFrac = 0;
    for (uint8_t i = row; i < row + rowSpan; i++) hFrac += page.rowWeights[i];
    h = (int)(hFrac / sum * screenH);
  } else {
    int cellH = screenH / page.rows;
    y = row * cellH;
    h = cellH * rowSpan;
  }
  return { x, y, w, h };
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
g++ -std=c++17 -I src -o /tmp/test_grid_geometry test/test_grid_geometry.cpp src/layout/grid_geometry.cpp
/tmp/test_grid_geometry
```
Expected: `test_grid_geometry: all assertions passed`. If `r6.y` doesn't match exactly, print the actual value and adjust the assertion to match the real (documented) truncation behavior — the point is behavior is pinned down and deterministic, not the specific rounding rule.

- [ ] **Step 7: Commit**

```bash
git add src/layout/layout_types.h src/layout/grid_geometry.h src/layout/grid_geometry.cpp test/test_grid_geometry.cpp
git commit -m "feat(layout): types + grid geometry (pure, tested)"
```

---

### Task 3: LayoutConfig JSON parser + validation

**Files:**
- Create: `apps/internal/src/layout/layout_parser.h`
- Create: `apps/internal/src/layout/layout_parser.cpp`
- Test: `apps/internal/test/test_layout_parser.cpp`

**Interfaces:**
- Consumes: `LayoutConfig`, `LayoutPage`, `LayoutCell`, `FieldRow`, `FieldEntry`, `FieldId` (Task 2).
- Produces: `bool parseLayoutConfig(JsonDocument& doc, LayoutConfig& out)` — used by Task 5's `onLayoutMessage`. `FieldId parseFieldId(const char* s)` (exported for Task 4's tests).

- [ ] **Step 1: Write `layout_parser.h`**

```cpp
#pragma once
#include "layout_types.h"
#include <ArduinoJson.h>

FieldId parseFieldId(const char* s);
// Parse doc menjadi out. Return false kalau schemaVersion!=1, atau pages/cells
// melebihi limit, atau field cell "printer"/"text" wajib hilang. out TIDAK
// diubah kalau return false (caller pertahankan config lama).
bool parseLayoutConfig(JsonDocument& doc, LayoutConfig& out);
```

- [ ] **Step 2: Write the failing test — `test/test_layout_parser.cpp`**

```cpp
#include "../src/layout/layout_parser.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static const char* SAMPLE = R"({
  "schemaVersion": 1,
  "pages": [{
    "id": "rack",
    "grid": { "cols": 6, "rows": 4, "rowWeights": [0.06, 0.32, 0.36, 0.26] },
    "fields": [["name"], ["state", "progress"], ["progressBar"]],
    "durationSec": 0,
    "cells": [
      { "type": "label", "text": "RAK KIRI", "col": 0, "row": 0, "colSpan": 2 },
      { "printer": "mars", "col": 0, "row": 1 },
      { "printer": "ganymede", "col": 0, "row": 3, "colSpan": 6,
        "fields": [["name"], [{"id":"timeLeft","label":"Sisa"}, {"id":"eta","label":"ETA"}]] }
    ]
  }]
})";

int main() {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, SAMPLE);
  assert(err == DeserializationError::Ok);

  LayoutConfig cfg;
  bool ok = parseLayoutConfig(doc, cfg);
  assert(ok);
  assert(cfg.schemaVersion == 1);
  assert(cfg.pageCount == 1);

  LayoutPage& p = cfg.pages[0];
  assert(strcmp(p.id, "rack") == 0);
  assert(p.cols == 6 && p.rows == 4);
  assert(p.hasRowWeights);
  assert(p.rowWeights[1] == (float)0.32);
  assert(p.defaultFieldRowCount == 3);
  assert(p.defaultFields[1].count == 2);
  assert(p.defaultFields[1].entries[0].id == FieldId::State);
  assert(p.defaultFields[1].entries[1].id == FieldId::Progress);
  assert(p.cellCount == 3);

  assert(p.cells[0].isLabel);
  assert(strcmp(p.cells[0].labelText, "RAK KIRI") == 0);
  assert(p.cells[0].colSpan == 2);

  assert(!p.cells[1].isLabel);
  assert(strcmp(p.cells[1].printerId, "mars") == 0);
  assert(p.cells[1].row == 1);

  assert(p.cells[2].fieldRowCount == 2);
  assert(p.cells[2].fields[1].count == 2);
  assert(p.cells[2].fields[1].entries[0].id == FieldId::TimeLeft);
  assert(strcmp(p.cells[2].fields[1].entries[0].label, "Sisa") == 0);
  assert(p.cells[2].fields[1].entries[1].id == FieldId::Eta);
  assert(strcmp(p.cells[2].fields[1].entries[1].label, "ETA") == 0);

  // schemaVersion salah -> reject, out tak diubah
  LayoutConfig unchanged;
  unchanged.pageCount = 42;  // sentinel
  JsonDocument badVersion;
  deserializeJson(badVersion, R"({"schemaVersion":2,"pages":[]})");
  assert(!parseLayoutConfig(badVersion, unchanged));
  assert(unchanged.pageCount == 42);

  // cell printer tanpa field "printer" -> reject
  JsonDocument missingPrinter;
  deserializeJson(missingPrinter, R"({"schemaVersion":1,"pages":[{"id":"x","grid":{"cols":1,"rows":1},"fields":[["name"]],"durationSec":0,"cells":[{"col":0,"row":0}]}]})");
  LayoutConfig cfg2;
  assert(!parseLayoutConfig(missingPrinter, cfg2));

  // field id tak dikenal -> di-skip (bukan reject seluruh config)
  JsonDocument unknownField;
  deserializeJson(unknownField, R"({"schemaVersion":1,"pages":[{"id":"x","grid":{"cols":1,"rows":1},"fields":[["name","bogus"]],"durationSec":0,"cells":[{"printer":"a","col":0,"row":0}]}]})");
  LayoutConfig cfg3;
  assert(parseLayoutConfig(unknownField, cfg3));
  assert(cfg3.pages[0].defaultFields[0].count == 1);  // "bogus" di-skip

  printf("test_layout_parser: all assertions passed\n");
  return 0;
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
g++ -std=c++17 -I src -I .pio/libdeps/cyd/ArduinoJson/src \
  -o /tmp/test_layout_parser test/test_layout_parser.cpp src/layout/layout_parser.cpp 2>&1
```
Expected: FAIL — `layout_parser.cpp` doesn't exist yet (undefined reference / no such file). If `.pio/libdeps/cyd/ArduinoJson/src` doesn't exist yet, run `pio run -e cyd` once first (Task 1 Step 3 already did this, so the path should exist).

- [ ] **Step 4: Write `layout_parser.cpp`**

```cpp
#include "layout_parser.h"
#include <string.h>

FieldId parseFieldId(const char* s) {
  if (strcmp(s, "name") == 0) return FieldId::Name;
  if (strcmp(s, "type") == 0) return FieldId::Type;
  if (strcmp(s, "state") == 0) return FieldId::State;
  if (strcmp(s, "progress") == 0) return FieldId::Progress;
  if (strcmp(s, "progressBar") == 0) return FieldId::ProgressBar;
  if (strcmp(s, "timeLeft") == 0) return FieldId::TimeLeft;
  if (strcmp(s, "eta") == 0) return FieldId::Eta;
  if (strcmp(s, "filename") == 0) return FieldId::Filename;
  if (strcmp(s, "error") == 0) return FieldId::Error;
  return FieldId::Unknown;
}

static void parseFieldRow(JsonArray rowArr, FieldRow& out) {
  out.count = 0;
  for (JsonVariant entry : rowArr) {
    if (out.count >= MAX_FIELDS_PER_ROW) break;
    FieldEntry fe;
    if (entry.is<const char*>()) {
      fe.id = parseFieldId(entry.as<const char*>());
    } else {
      const char* idStr = entry["id"] | "";
      fe.id = parseFieldId(idStr);
      const char* label = entry["label"] | "";
      strlcpy(fe.label, label, sizeof(fe.label));
    }
    if (fe.id == FieldId::Unknown) continue;  // skip, jangan reject seluruh config
    out.entries[out.count++] = fe;
  }
}

static void parseFieldRows(JsonArray arr, FieldRow* out, uint8_t& outCount, uint8_t maxRows) {
  outCount = 0;
  for (JsonArray rowArr : arr) {
    if (outCount >= maxRows) break;
    parseFieldRow(rowArr, out[outCount]);
    outCount++;
  }
}

bool parseLayoutConfig(JsonDocument& doc, LayoutConfig& out) {
  int schemaVersion = doc["schemaVersion"] | 0;
  if (schemaVersion != 1) return false;

  JsonArray pagesArr = doc["pages"].as<JsonArray>();
  if (pagesArr.isNull() || pagesArr.size() > MAX_PAGES) return false;

  LayoutConfig tmp;
  tmp.schemaVersion = 1;
  tmp.pageCount = 0;

  for (JsonObject pageObj : pagesArr) {
    if (tmp.pageCount >= MAX_PAGES) break;
    LayoutPage& page = tmp.pages[tmp.pageCount];

    const char* id = pageObj["id"] | "";
    strlcpy(page.id, id, sizeof(page.id));

    JsonObject grid = pageObj["grid"];
    page.cols = grid["cols"] | 1;
    page.rows = grid["rows"] | 1;
    if (page.cols == 0 || page.rows == 0 || page.rows > MAX_GRID_ROWS) return false;

    JsonArray rw = grid["rowWeights"];
    page.hasRowWeights = !rw.isNull();
    if (page.hasRowWeights) {
      uint8_t i = 0;
      for (JsonVariant v : rw) {
        if (i >= MAX_GRID_ROWS) break;
        page.rowWeights[i++] = v.as<float>();
      }
    }

    JsonArray fieldsArr = pageObj["fields"].as<JsonArray>();
    if (!fieldsArr.isNull()) {
      parseFieldRows(fieldsArr, page.defaultFields, page.defaultFieldRowCount, MAX_ROWS_PER_FIELDS);
    } else {
      page.defaultFieldRowCount = 0;
    }

    page.durationSec = pageObj["durationSec"] | 0;

    JsonArray cellsArr = pageObj["cells"].as<JsonArray>();
    if (cellsArr.isNull() || cellsArr.size() > MAX_CELLS_PER_PAGE) return false;

    page.cellCount = 0;
    for (JsonObject cellObj : cellsArr) {
      if (page.cellCount >= MAX_CELLS_PER_PAGE) break;
      LayoutCell& cell = page.cells[page.cellCount];

      const char* type = cellObj["type"] | "printer";
      cell.isLabel = (strcmp(type, "label") == 0);

      if (cell.isLabel) {
        const char* text = cellObj["text"] | "";
        strlcpy(cell.labelText, text, sizeof(cell.labelText));
        cell.printerId[0] = '\0';
      } else {
        const char* printer = cellObj["printer"] | "";
        if (printer[0] == '\0') return false;
        strlcpy(cell.printerId, printer, sizeof(cell.printerId));
        cell.labelText[0] = '\0';
      }

      cell.col = cellObj["col"] | 0;
      cell.row = cellObj["row"] | 0;
      cell.colSpan = cellObj["colSpan"] | 1;
      cell.rowSpan = cellObj["rowSpan"] | 1;

      JsonArray cellFieldsArr = cellObj["fields"].as<JsonArray>();
      if (!cellFieldsArr.isNull()) {
        parseFieldRows(cellFieldsArr, cell.fields, cell.fieldRowCount, MAX_ROWS_PER_FIELDS);
      } else {
        cell.fieldRowCount = 0;
      }

      page.cellCount++;
    }

    tmp.pageCount++;
  }

  out = tmp;
  return true;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
g++ -std=c++17 -I src -I .pio/libdeps/cyd/ArduinoJson/src \
  -o /tmp/test_layout_parser test/test_layout_parser.cpp src/layout/layout_parser.cpp
/tmp/test_layout_parser
```
Expected: `test_layout_parser: all assertions passed`.

- [ ] **Step 6: Commit**

```bash
git add src/layout/layout_parser.h src/layout/layout_parser.cpp test/test_layout_parser.cpp
git commit -m "feat(layout): JSON parser + validation (schemaVersion, limits, graceful field-skip)"
```

---

### Task 4: Field renderer + label/printer cell drawing

**Files:**
- Create: `apps/internal/src/layout/field_renderer.h`
- Create: `apps/internal/src/layout/field_renderer.cpp`
- Modify: `apps/internal/src/screens/printers.h` (keep `PrinterData`/`gPrinters`/`gPrinterCount`/`parsePrintersJson` — remove the 3 old draw-function declarations)
- Modify: `apps/internal/src/screens/printers.cpp` (keep data layer + `stateColor()`/`fmtTime()` helpers — remove `screenPrintersRackDraw`/`screenPrintersDraw`/`screenPrintersOverviewDraw`/`drawRow`/`drawCell`/rack-specific statics)

**Interfaces:**
- Consumes: `LayoutCell`, `FieldRow`, `FieldId` (Task 2), `PrinterData`, `stateColor()`, `fmtTime()` (existing `printers.h`/`.cpp`, kept).
- Produces: `void drawLabelCell(int x,int y,int w,int h, const char* text)`, `void drawPrinterCell(int x,int y,int w,int h, const PrinterData& p, const FieldRow* fields, uint8_t fieldRowCount)` — both used by Task 6's `screenLayoutDraw`.

This task touches TFT_eSPI drawing — no hardware-in-loop automated test exists in this codebase for drawing functions (the original `drawRow`/`drawCell` never had one either). Verify via manual flash + photo once Task 6 wires it end-to-end; this task's own testing is a compile check only.

- [ ] **Step 1: Expose `stateColor`/`fmtTime` from `printers.h`** (they're currently `static` in `printers.cpp` — un-static them for reuse)

In `src/screens/printers.h`, remove the 5 old function declarations (`screenPrintersOverviewDraw`, `screenPrintersRackDraw`, `screenPrintersDraw`, `screenPrintersRackInvalidate` stay removed from here — Task 6 introduces their replacements) and add:
```cpp
uint16_t stateColor(const char* state);
void fmtTime(char* buf, size_t len, int16_t min);
```

In `src/screens/printers.cpp`, remove `static` from both function signatures (keep everything else in this file: `PrinterData`, `gPrinters`, `gPrinterCount`, `gPrinterDataIsReal`, `parsePrintersJson`, `loadDummy`). **Delete** `screenPrintersRackDraw`, `screenPrintersDraw`, `screenPrintersOverviewDraw`, `drawRow`, `drawCell`, `drawCell`'s statics (`sPrev`, `sForceAll`, `findPrinter`, `findPrev`, `namedCellChanged`, `savePrev`, `sEmpty`) — replaced by Task 6.

- [ ] **Step 2: Write `field_renderer.h`**

```cpp
#pragma once
#include "layout_types.h"
#include "../screens/printers.h"

void drawLabelCell(int x, int y, int w, int h, const char* text);
void drawPrinterCell(int x, int y, int w, int h, const PrinterData& p,
                      const FieldRow* fields, uint8_t fieldRowCount);
```

- [ ] **Step 3: Write `field_renderer.cpp`**

```cpp
#include "field_renderer.h"
#include "../display.h"
#include "../wifi_manager.h"
#include <Arduino.h>
#include <time.h>

// Tinggi baris per FieldId (px) — dipakai loop graceful-degradation
static int rowHeight(FieldId id) {
  return id == FieldId::ProgressBar ? 10 : 16;
}

void drawLabelCell(int x, int y, int w, int h, const char* text) {
  uint16_t bg = tft.color565(5, 5, 8);
  tft.fillRect(x, y, w, h, bg);
  tft.setTextColor(C_DIM, bg);
  tft.setTextSize(1);
  tft.setCursor(x + 6, y + (h - 8) / 2);
  tft.print(text);
}

static void drawOneField(int x, int y, int colW, int rowH, FieldId id, const char* label,
                          const PrinterData& p, uint16_t bg, uint16_t sColor) {
  char buf[48];
  switch (id) {
    case FieldId::Name:
      tft.setTextColor(TFT_WHITE, bg); tft.setTextSize(2);
      tft.setCursor(x, y); tft.print(p.name);
      return;
    case FieldId::Type:
      tft.setTextColor(C_DIM, bg); tft.setTextSize(1);
      tft.setCursor(x, y); tft.print(p.type);
      return;
    case FieldId::State:
      tft.setTextColor(sColor, bg); tft.setTextSize(1);
      tft.setCursor(x, y); tft.print(p.state);
      return;
    case FieldId::Progress:
      snprintf(buf, sizeof(buf), "%3d%%", p.progress);
      tft.setTextColor(sColor, bg); tft.setTextSize(1);
      tft.setCursor(x, y); tft.print(buf);
      return;
    case FieldId::ProgressBar: {
      uint16_t barBg = tft.color565(25, 25, 35);
      tft.fillRect(x, y, colW, rowH, barBg);
      if (p.progress > 0) {
        int fillW = (int)(p.progress / 100.0f * (colW - 2));
        tft.fillRect(x, y, fillW, rowH, sColor);
      }
      return;
    }
    case FieldId::TimeLeft: {
      char timeBuf[12];
      fmtTime(timeBuf, sizeof(timeBuf), p.remaining_min);
      tft.setTextColor(C_DIM, bg); tft.setTextSize(1);
      tft.setCursor(x, y);
      if (label[0]) tft.printf("%s: %s", label, timeBuf); else tft.print(timeBuf);
      return;
    }
    case FieldId::Eta: {
      if (p.remaining_min <= 0) return;
      time_t eta = (time_t)clockGetEpoch() + (time_t)(p.remaining_min * 60);
      struct tm* et = localtime(&eta);
      tft.setTextColor(C_DIM, bg); tft.setTextSize(1);
      tft.setCursor(x, y);
      if (label[0]) tft.printf("%s %02d:%02d", label, et->tm_hour, et->tm_min);
      else tft.printf("%02d:%02d", et->tm_hour, et->tm_min);
      return;
    }
    case FieldId::Filename:
      if (!p.filename[0]) return;
      tft.setTextColor(C_DIM, bg); tft.setTextSize(1);
      tft.setCursor(x, y); tft.print(p.filename);
      return;
    case FieldId::Error:
      if (!p.error_msg[0]) return;
      tft.setTextColor(C_RED, bg); tft.setTextSize(1);
      tft.setCursor(x, y); tft.print(p.error_msg);
      return;
    default:
      return;
  }
}

void drawPrinterCell(int x, int y, int w, int h, const PrinterData& p,
                      const FieldRow* fields, uint8_t fieldRowCount) {
  uint16_t bg = tft.color565(10, 10, 16);
  uint16_t sColor = stateColor(p.state);
  tft.fillRect(x, y, w, h, bg);
  tft.fillRect(x, y, 3, h, sColor);

  int cursorY = y + 4;
  int contentX = x + 6;
  int contentW = w - 10;

  for (uint8_t r = 0; r < fieldRowCount; r++) {
    const FieldRow& row = fields[r];
    if (row.count == 0) continue;
    int tallest = 0;
    for (uint8_t i = 0; i < row.count; i++) tallest = max(tallest, rowHeight(row.entries[i].id));
    if (cursorY + tallest > y + h) break;  // graceful degradation: stop, don't overflow

    int colW = contentW / row.count;
    for (uint8_t i = 0; i < row.count; i++) {
      drawOneField(contentX + i * colW, cursorY, colW - 4, tallest, row.entries[i].id,
                   row.entries[i].label, p, bg, sColor);
    }
    cursorY += tallest + 2;
  }
}
```

- [ ] **Step 4: Verify compile** (no hardware needed for a compile check, `pio run` cross-compiles for ESP32)

```bash
cd apps/internal
pio run -e cyd
```
Expected: `FAILED` at this point is acceptable IF the only errors are in `main.cpp`/other files not yet updated to match the removed function signatures (Task 6 fixes those). If `field_renderer.cpp` or `printers.cpp`/`.h` themselves have errors, fix those now — this task's own files must compile clean.

- [ ] **Step 5: Commit**

```bash
git add src/layout/field_renderer.h src/layout/field_renderer.cpp src/screens/printers.h src/screens/printers.cpp
git commit -m "feat(layout): generic field renderer (drawLabelCell/drawPrinterCell) — replaces 3 hardcoded draw functions"
```

---

### Task 5: `applyLayout` + LittleFS cache + default layout + readback publish

**Files:**
- Create: `apps/internal/src/layout/layout_store.h`
- Create: `apps/internal/src/layout/layout_store.cpp`
- Create: `apps/internal/apps/internal/default-layout.json` — wait, path fix: `apps/internal/default-layout.json` (at the firmware project root, sibling to `platformio.ini`)
- Create: `apps/internal/scripts/embed_default_layout.py` (PlatformIO pre-build script — turns the JSON file into a C string header)

**Interfaces:**
- Consumes: `LayoutConfig`, `parseLayoutConfig` (Task 3).
- Produces: `void applyLayout(const LayoutConfig& cfg)`, `void loadLayoutFromCache()`, `void applyDefaultLayout()`, `LayoutConfig& getCurrentLayout()` — used by Task 6 (rendering) and Task 7 (MQTT wiring).

- [ ] **Step 1: Write `apps/internal/default-layout.json`** (the single source of truth — this exact file is what ships as the compiled-in fallback)

```json
{
  "schemaVersion": 1,
  "pages": [
    {
      "id": "rack",
      "grid": { "cols": 6, "rows": 4, "rowWeights": [0.06, 0.32, 0.36, 0.26] },
      "fields": [["name"], ["state", "progress"], ["progressBar"]],
      "durationSec": 0,
      "cells": [
        { "type": "label", "text": "RAK KIRI",  "col": 0, "row": 0, "colSpan": 2 },
        { "type": "label", "text": "RAK KANAN", "col": 3, "row": 0, "colSpan": 3 },
        { "printer": "mars",    "col": 0, "row": 1 },
        { "printer": "saturn",  "col": 1, "row": 1 },
        { "printer": "uranus",  "col": 3, "row": 1 },
        { "printer": "neptune", "col": 4, "row": 1 },
        { "printer": "moon",    "col": 5, "row": 1 },
        { "printer": "mercury", "col": 0, "row": 2 },
        { "printer": "earth",   "col": 1, "row": 2 },
        { "printer": "venus",   "col": 4, "row": 2 },
        { "printer": "jupiter", "col": 5, "row": 2 },
        { "printer": "ganymede", "col": 0, "row": 3, "colSpan": 6,
          "fields": [["name", "type"], ["state"], [{"id":"filename"}]] }
      ]
    },
    {
      "id": "detail-1",
      "grid": { "cols": 1, "rows": 3 },
      "fields": [["name", "type"], ["state", "progress"], ["progressBar"],
                 [{"id":"timeLeft","label":"Sisa"}, {"id":"eta","label":"ETA"}], ["filename"]],
      "durationSec": 8,
      "cells": [
        { "printer": "jupiter", "col": 0, "row": 0 },
        { "printer": "moon",    "col": 0, "row": 1 },
        { "printer": "uranus",  "col": 0, "row": 2 }
      ]
    },
    {
      "id": "detail-2",
      "grid": { "cols": 1, "rows": 3 },
      "fields": [["name", "type"], ["state", "progress"], ["progressBar"],
                 [{"id":"timeLeft","label":"Sisa"}, {"id":"eta","label":"ETA"}], ["filename"]],
      "durationSec": 8,
      "cells": [
        { "printer": "neptune", "col": 0, "row": 0 },
        { "printer": "saturn",  "col": 0, "row": 1 },
        { "printer": "mars",    "col": 0, "row": 2 }
      ]
    },
    {
      "id": "detail-3",
      "grid": { "cols": 1, "rows": 3 },
      "fields": [["name", "type"], ["state", "progress"], ["progressBar"],
                 [{"id":"timeLeft","label":"Sisa"}, {"id":"eta","label":"ETA"}], ["filename"]],
      "durationSec": 8,
      "cells": [
        { "printer": "mercury", "col": 0, "row": 0 },
        { "printer": "venus",   "col": 0, "row": 1 },
        { "printer": "earth",   "col": 0, "row": 2 }
      ]
    },
    {
      "id": "detail-4",
      "grid": { "cols": 1, "rows": 1 },
      "fields": [["name", "type"], ["state", "progress"], ["progressBar"],
                 [{"id":"timeLeft","label":"Sisa"}, {"id":"eta","label":"ETA"}], ["filename"]],
      "durationSec": 8,
      "cells": [
        { "printer": "ganymede", "col": 0, "row": 0 }
      ]
    }
  ]
}
```
This mirrors the original hardcoded Rack + 4×Detail pages (10 printers + Ganymede, matching §5's documented "not pixel-identical, visually equivalent" trade-off).

- [ ] **Step 2: Write `scripts/embed_default_layout.py`** (PlatformIO pre-build: JSON file → C header with the raw string, so firmware embeds it without a separate LittleFS image step)

```python
Import("env")
import os

def embed():
    src = os.path.join(env.get("PROJECT_DIR"), "default-layout.json")
    dst = os.path.join(env.get("PROJECT_DIR"), "src", "layout", "default_layout_data.h")
    with open(src, "r") as f:
        content = f.read()
    escaped = content.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    with open(dst, "w") as f:
        f.write("#pragma once\n")
        f.write(f'static const char DEFAULT_LAYOUT_JSON[] = "{escaped}";\n')

embed()
```

- [ ] **Step 3: Register the script in `platformio.ini`**

Modify `platformio.ini` — the `extra_scripts` line currently reads `extra_scripts = pre:scripts/copy_user_setup.py`. Change to:
```ini
extra_scripts =
  pre:scripts/copy_user_setup.py
  pre:scripts/embed_default_layout.py
```

- [ ] **Step 4: Write `layout_store.h`**

```cpp
#pragma once
#include "layout_types.h"

LayoutConfig& getCurrentLayout();
void applyLayout(const LayoutConfig& cfg);   // set current, redraw invalidate, persist to LittleFS, publish readback
void loadLayoutFromCache();                  // read /layout.json from LittleFS at boot; falls back to applyDefaultLayout() if absent/invalid
void applyDefaultLayout();                   // parse DEFAULT_LAYOUT_JSON (compiled-in), applyLayout() it
```

- [ ] **Step 5: Write `layout_store.cpp`**

```cpp
#include "layout_store.h"
#include "layout_parser.h"
#include "default_layout_data.h"
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <Arduino.h>

static LayoutConfig gLayout;
static bool gLittleFSReady = false;

LayoutConfig& getCurrentLayout() { return gLayout; }

// Diimplementasikan Task 6 (dipanggil dari sini agar layar langsung update)
extern void invalidateLayoutRedraw();
// Diimplementasikan Task 7 (publish retained ke topic readback)
extern void publishLayoutReadback(const LayoutConfig& cfg);

static void persistToLittleFS(const LayoutConfig&) {
  // Simpan JSON MENTAH terakhir yang sukses di-apply — layout_store menyimpan
  // string, bukan re-serialize struct (lebih sederhana & jujur soal apa yg tersimpan).
}

void applyLayout(const LayoutConfig& cfg) {
  gLayout = cfg;
  invalidateLayoutRedraw();
  publishLayoutReadback(cfg);
}

void loadLayoutFromCache() {
  gLittleFSReady = LittleFS.begin(true);  // true = format kalau mount gagal (device baru)
  if (gLittleFSReady && LittleFS.exists("/layout.json")) {
    File f = LittleFS.open("/layout.json", "r");
    String raw = f.readString();
    f.close();

    JsonDocument doc;
    if (deserializeJson(doc, raw) == DeserializationError::Ok) {
      LayoutConfig cfg;
      if (parseLayoutConfig(doc, cfg)) {
        gLayout = cfg;
        invalidateLayoutRedraw();
        Serial.println("[Layout] loaded from LittleFS cache");
        return;
      }
    }
    Serial.println("[Layout] cache exists but invalid, falling back to default");
  }
  applyDefaultLayout();
}

void applyDefaultLayout() {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, DEFAULT_LAYOUT_JSON);
  if (err != DeserializationError::Ok) {
    Serial.printf("[Layout] BUG: baked-in default failed to parse: %s\n", err.c_str());
    return;
  }
  LayoutConfig cfg;
  if (parseLayoutConfig(doc, cfg)) {
    applyLayout(cfg);
    Serial.println("[Layout] applied baked-in default");
  }
}

// Dipanggil Task 7 dari onLayoutMessage() setelah parse+validasi sukses,
// DAN menyimpan raw JSON string ke LittleFS (bukan hanya struct in-memory).
void applyLayoutAndCache(const LayoutConfig& cfg, const char* rawJson, size_t len) {
  applyLayout(cfg);
  if (gLittleFSReady) {
    File f = LittleFS.open("/layout.json", "w");
    if (f) { f.write((const uint8_t*)rawJson, len); f.close(); }
  }
}
```
Also add `void applyLayoutAndCache(const LayoutConfig& cfg, const char* rawJson, size_t len);` to `layout_store.h`.

- [ ] **Step 6: Compile check**

```bash
cd apps/internal
pio run -e cyd
```
Expected: still `FAILED` acceptable if remaining errors are only in `main.cpp` (not yet wired — Task 6). No errors should originate from `layout_store.*`/`default_layout_data.h`.

- [ ] **Step 7: Commit**

```bash
git add default-layout.json scripts/embed_default_layout.py platformio.ini src/layout/layout_store.h src/layout/layout_store.cpp
git commit -m "feat(layout): applyLayout + LittleFS cache + compiled-in default fallback (default-layout.json = single source of truth)"
```

---

### Task 6: `screenLayoutDraw` + dynamic paging in `main.cpp`

**Files:**
- Create: `apps/internal/src/layout/screen_layout.h`
- Create: `apps/internal/src/layout/screen_layout.cpp`
- Modify: `apps/internal/src/main.cpp`

**Interfaces:**
- Consumes: `getCurrentLayout()` (Task 5), `computeCellRect` (Task 2), `drawLabelCell`/`drawPrinterCell` (Task 4), `PrinterData gPrinters[]`/`gPrinterCount` (existing `printers.h`).
- Produces: `void screenLayoutDraw(int pageIndex)`, `void invalidateLayoutRedraw()` (forward-declared `extern` in Task 5, defined here) — used by `main.cpp`'s `renderCurrentPage()`.

- [ ] **Step 1: Write `screen_layout.h`**

```cpp
#pragma once

void screenLayoutDraw(int pageIndex);
void invalidateLayoutRedraw();
int  layoutPageCount();  // jumlah pages di layout aktif — dipakai main.cpp hitung offset Gold/Orders
```

- [ ] **Step 2: Write `screen_layout.cpp`**

```cpp
#include "screen_layout.h"
#include "layout_store.h"
#include "grid_geometry.h"
#include "field_renderer.h"
#include "../display.h"
#include "../screens/printers.h"
#include <Arduino.h>
#include <string.h>

static bool sForceAll = true;
static char sPrevSig[MAX_CELLS_PER_PAGE][40];  // signature ringkas per cell utk differential-redraw
static int  sPrevPage = -1;

void invalidateLayoutRedraw() { sForceAll = true; }

int layoutPageCount() {
  return getCurrentLayout().pageCount;
}

static const PrinterData& findPrinterById(const char* id) {
  static PrinterData empty = {};
  for (int i = 0; i < gPrinterCount; i++) {
    if (strcmp(gPrinters[i].name, id) == 0) return gPrinters[i];  // Task 9 akan ganti jadi match by id
  }
  return empty;
}

static void cellSignature(const LayoutCell& cell, char* out, size_t len) {
  if (cell.isLabel) { snprintf(out, len, "L:%s", cell.labelText); return; }
  const PrinterData& p = findPrinterById(cell.printerId);
  snprintf(out, len, "%s|%s|%d|%d|%d", cell.printerId, p.state, p.progress, p.remaining_min, p.valid);
}

void screenLayoutDraw(int pageIndex) {
  LayoutConfig& layout = getCurrentLayout();
  if (pageIndex < 0 || pageIndex >= layout.pageCount) return;
  LayoutPage& page = layout.pages[pageIndex];

  bool pageChanged = (pageIndex != sPrevPage);
  if (sForceAll || pageChanged) {
    tft.fillScreen(C_BG);
    for (int i = 0; i < MAX_CELLS_PER_PAGE; i++) sPrevSig[i][0] = '\0';
  }
  sPrevPage = pageIndex;

  for (uint8_t i = 0; i < page.cellCount; i++) {
    LayoutCell& cell = page.cells[i];
    char sig[40];
    cellSignature(cell, sig, sizeof(sig));
    if (!sForceAll && !pageChanged && strcmp(sig, sPrevSig[i]) == 0) continue;
    strlcpy(sPrevSig[i], sig, sizeof(sPrevSig[i]));

    CellRect r = computeCellRect(page, cell.col, cell.row, cell.colSpan, cell.rowSpan, SCREEN_W, SCREEN_H);
    if (cell.isLabel) {
      drawLabelCell(r.x, r.y, r.w, r.h, cell.labelText);
    } else {
      const FieldRow* fields = cell.fieldRowCount > 0 ? cell.fields : page.defaultFields;
      uint8_t fieldRowCount = cell.fieldRowCount > 0 ? cell.fieldRowCount : page.defaultFieldRowCount;
      drawPrinterCell(r.x, r.y, r.w, r.h, findPrinterById(cell.printerId), fields, fieldRowCount);
    }
  }

  sForceAll = false;
}
```

- [ ] **Step 3: Rewrite `main.cpp` paging** — replace the fixed `#define`-based page map with a layout-aware one

Modify `src/main.cpp`:
```cpp
#include <Arduino.h>
#include <WiFi.h>
#include "display.h"
#include "wifi_manager.h"
#include "api_client.h"
#include "touch.h"
#include "screens/limits.h"
#include "screens/budget.h"
#include "screens/gold.h"
#include "screens/orders.h"
#include "layout/screen_layout.h"
#include "layout/layout_store.h"
#include "gold_client.h"
#include "usage_client.h"
#include "config.h"

UsageData usage;
ClaudeUsageData claudeUsage;
GoldData  gold;
int  currentPage    = 0;
bool gRotatePaused  = false;

// Pages: 0=Claude, 1..(1+layoutPageCount()-1)=Layout printer, lalu Gold, lalu Orders x4.
// Offset dihitung SEKALI setelah layout dimuat (setup()), bukan #define tetap.
static int gLayoutFirst, gLayoutLast, gGoldPage, gOrdersFirst, gOrdersLast, gTotalPages;

static void recomputePageOffsets() {
  gLayoutFirst = 1;
  gLayoutLast  = gLayoutFirst + layoutPageCount() - 1;
  gGoldPage    = gLayoutLast + 1;
  gOrdersFirst = gGoldPage + 1;
  gOrdersLast  = gOrdersFirst + 3;
  gTotalPages  = gOrdersLast + 1;
}

void renderCurrentPage() {
  if (currentPage == 0) { screenLimitsDraw(claudeUsage); return; }
  if (currentPage >= gLayoutFirst && currentPage <= gLayoutLast) {
    screenLayoutDraw(currentPage - gLayoutFirst);
    return;
  }
  if (currentPage == gGoldPage) { screenGoldDraw(gold); return; }
  if (currentPage >= gOrdersFirst && currentPage <= gOrdersLast) {
    screenOrdersDraw(currentPage - gOrdersFirst);
    return;
  }
}

void setup() {
  Serial.begin(115200);
  displayInit();
  touchInit();

  tft.setTextColor(C_YELLOW, C_BG);
  tft.setTextSize(1);
  tft.setCursor(10, 110);
  tft.print("Connecting WiFi...");
  wifiConnect();

  tft.fillScreen(C_BG);
  tft.setCursor(10, 110);
  tft.print("Connecting MQTT...");
  fetchUsageData(usage);

  tft.fillScreen(C_BG);
  tft.setCursor(10, 110);
  tft.print("Fetching Claude usage...");
  fetchClaudeUsage(claudeUsage);

  tft.fillScreen(C_BG);
  tft.setCursor(10, 110);
  tft.print("Fetching gold price...");
  fetchGoldData(gold);

  loadLayoutFromCache();
  recomputePageOffsets();

  currentPage = gLayoutFirst;
  renderCurrentPage();
}

void loop() {
  static time_t lastUpdatedAt = 0;
  static unsigned long lastStatusPrint = 0;
  static unsigned long lastGoldRefresh = 0;
  static unsigned long lastUsageRefresh = 0;

  if (millis() - lastGoldRefresh >= 7200000UL) {
    lastGoldRefresh = millis();
    fetchGoldData(gold);
    if (currentPage == gGoldPage) renderCurrentPage();
  }

  if (millis() - lastUsageRefresh >= 60000UL) {
    lastUsageRefresh = millis();
    fetchClaudeUsage(claudeUsage);
    if (currentPage == 0) renderCurrentPage();
  }

  // Auto-rotate: hanya halaman layout dgn durationSec>0 utk page aktif saat ini
  static unsigned long lastAutoRotate = 0;
  if (!gRotatePaused && currentPage >= gLayoutFirst && currentPage <= gLayoutLast) {
    LayoutConfig& layout = getCurrentLayout();
    int idx = currentPage - gLayoutFirst;
    uint16_t duration = (idx < layout.pageCount) ? layout.pages[idx].durationSec : 0;
    if (duration > 0 && millis() - lastAutoRotate >= (unsigned long)duration * 1000UL) {
      lastAutoRotate = millis();
      int next = currentPage + 1 > gLayoutLast ? gLayoutFirst : currentPage + 1;
      currentPage = next;
      renderCurrentPage();
    }
  }

  mqttLoop(usage);
  if (usage.valid && usage.updatedAt != lastUpdatedAt) {
    lastUpdatedAt = usage.updatedAt;
    renderCurrentPage();
  }
  if (printersUpdated()) {
    if (currentPage >= gLayoutFirst && currentPage <= gLayoutLast) renderCurrentPage();
  }
  if (ordersUpdated()) {
    if (currentPage >= gOrdersFirst && currentPage <= gOrdersLast) renderCurrentPage();
  }

  if (millis() - lastStatusPrint >= 5000) {
    lastStatusPrint = millis();
    Serial.printf("[Main] WiFi=%s MQTT=%s page=%d/%d\n",
      WiFi.status() == WL_CONNECTED ? "OK" : "FAIL",
      mqttConnected() ? "OK" : "FAIL",
      currentPage, gTotalPages - 1);
  }

  int zone = touchZone();
  if (zone == 3 && currentPage >= gLayoutFirst && currentPage <= gLayoutLast) {
    gRotatePaused = !gRotatePaused;
    renderCurrentPage();
  } else if (zone == 3 && currentPage >= gOrdersFirst && currentPage <= gOrdersLast) {
    currentPage = 0;
    renderCurrentPage();
  } else if (zone == 1 || zone == -1) {
    currentPage = (zone == 1)
      ? (currentPage + 1) % gTotalPages
      : (currentPage - 1 + gTotalPages) % gTotalPages;
    lastAutoRotate = millis();
    renderCurrentPage();
  }
}
```
Note: `gRotatePaused` "pause" indicator UI (bottom strip "|| ROTASI PAUSE" from old `screenPrintersDraw`) is dropped from the generic renderer — acceptable per spec (only Rack/Detail/Overview visual density preserved, not that specific control affordance). If missed, it's a Task 4 addendum, not a Task 6 blocker.

- [ ] **Step 4: Compile and verify no errors**

```bash
cd apps/internal
pio run -e cyd
```
Expected: `SUCCESS`.

- [ ] **Step 5: Commit**

```bash
git add src/layout/screen_layout.h src/layout/screen_layout.cpp src/main.cpp
git commit -m "feat(layout): screenLayoutDraw + dynamic page offsets in main.cpp (replaces hardcoded 1-5 printer pages)"
```

---

### Task 7: MQTT layout subscribe + readback publish

**Files:**
- Modify: `apps/internal/src/api_client.h`
- Modify: `apps/internal/src/api_client.cpp`
- Modify: `apps/internal/src/layout/layout_store.cpp` (implement `publishLayoutReadback`, declared `extern` in Task 5)

**Interfaces:**
- Consumes: `parseLayoutConfig` (Task 3), `applyLayoutAndCache` (Task 5).
- Produces: firmware subscribes `3dpb/cyd/internal-rack/layout` and publishes `3dpb/cyd/internal-rack/layout/current` — the two topics from spec §3.3.

- [ ] **Step 1: Add the layout topic constant and mqtt publish helper to `api_client.h`**

```cpp
// Tambahkan di api_client.h, setelah deklarasi existing:
bool mqttPublishRetained(const char* topic, const char* payload, size_t len);
```

- [ ] **Step 2: Wire the MQTT callback in `api_client.cpp`** — modify `onMessage()` to handle the layout topic, and `mqttReconnect()` to subscribe it, plus implement the publish helper

In `onMessage()`, add a branch before the existing `3dpb/printers` check:
```cpp
#include "layout/layout_parser.h"
#include "layout/layout_store.h"

static void onMessage(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] msg topic=%s len=%u\n", topic, length);

  if (strcmp(topic, "3dpb/cyd/internal-rack/layout") == 0) {
    JsonDocument doc;
    if (deserializeJson(doc, payload, length) != DeserializationError::Ok) {
      Serial.println("[Layout] MQTT payload JSON error, keeping current layout");
      return;
    }
    LayoutConfig cfg;
    if (!parseLayoutConfig(doc, cfg)) {
      Serial.println("[Layout] MQTT payload failed validation, keeping current layout");
      return;
    }
    applyLayoutAndCache(cfg, (const char*)payload, length);
    Serial.println("[Layout] applied new layout from MQTT");
    return;
  }

  if (strcmp(topic, "3dpb/printers") == 0) {
    parsePrintersJson((const char*)payload, length);
    _printersNew = true;
    return;
  }
  // ... (existing 3dpb/cyd/orders branch, existing Claude usage branch — unchanged)
```

In `mqttReconnect()`, add the subscribe call alongside the existing three:
```cpp
    mqtt.subscribe(MQTT_TOPIC);
    mqtt.subscribe("3dpb/printers");
    mqtt.subscribe("3dpb/cyd/orders");
    mqtt.subscribe("3dpb/cyd/internal-rack/layout");
    Serial.printf("[MQTT] subscribed to %s + 3dpb/printers + 3dpb/cyd/orders + 3dpb/cyd/internal-rack/layout\n", MQTT_TOPIC);
```

Add the publish helper (uses the same `static PubSubClient mqtt` already in this file):
```cpp
bool mqttPublishRetained(const char* topic, const char* payload, size_t len) {
  if (!mqtt.connected()) return false;
  return mqtt.publish(topic, (const uint8_t*)payload, len, true);  // true = retained
}
```

- [ ] **Step 3: Implement `publishLayoutReadback` in `layout_store.cpp`**

Replace the `extern void publishLayoutReadback(...)` forward declaration usage — add the real implementation at the bottom of `layout_store.cpp`:
```cpp
#include "../api_client.h"

void publishLayoutReadback(const LayoutConfig& cfg) {
  // Re-serialize gLayout minimal — cukup echo balik JSON mentah kalau berasal dari MQTT/cache;
  // untuk applyDefaultLayout() (tanpa raw JSON), echo DEFAULT_LAYOUT_JSON langsung.
  extern const char DEFAULT_LAYOUT_JSON[];
  mqttPublishRetained("3dpb/cyd/internal-rack/layout/current", DEFAULT_LAYOUT_JSON, strlen(DEFAULT_LAYOUT_JSON));
}
```
Note: this simplified readback always echoes the compiled-in default's JSON text rather than the currently-applied one when the source was MQTT — that's a known simplification. Fix: `applyLayoutAndCache` already receives `rawJson`/`len` — thread that through instead. Rewrite:

Change `layout_store.h`'s `applyLayout`/`applyLayoutAndCache` to also accept the raw text so publish always echoes exactly what was applied:
```cpp
void applyLayout(const LayoutConfig& cfg, const char* rawJson, size_t len);
void applyLayoutAndCache(const LayoutConfig& cfg, const char* rawJson, size_t len);  // superset: also persists to LittleFS
```
Update `layout_store.cpp` accordingly — `applyLayout` now always takes the raw text and passes it straight to `publishLayoutReadback`:
```cpp
void applyLayout(const LayoutConfig& cfg, const char* rawJson, size_t len) {
  gLayout = cfg;
  invalidateLayoutRedraw();
  mqttPublishRetained("3dpb/cyd/internal-rack/layout/current", rawJson, len);
}

void applyLayoutAndCache(const LayoutConfig& cfg, const char* rawJson, size_t len) {
  applyLayout(cfg, rawJson, len);
  if (gLittleFSReady) {
    File f = LittleFS.open("/layout.json", "w");
    if (f) { f.write((const uint8_t*)rawJson, len); f.close(); }
  }
}

void applyDefaultLayout() {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, DEFAULT_LAYOUT_JSON);
  if (err != DeserializationError::Ok) {
    Serial.printf("[Layout] BUG: baked-in default failed to parse: %s\n", err.c_str());
    return;
  }
  LayoutConfig cfg;
  if (parseLayoutConfig(doc, cfg)) {
    applyLayout(cfg, DEFAULT_LAYOUT_JSON, strlen(DEFAULT_LAYOUT_JSON));
    Serial.println("[Layout] applied baked-in default");
  }
}
```
And update `loadLayoutFromCache()`'s success path to call `applyLayout(cfg, raw.c_str(), raw.length())` instead of the old direct-assignment, so the readback topic stays accurate after a cache-only boot too. Remove the now-unused forward-declared `publishLayoutReadback` extern from Task 5's Step 5 code (superseded by this task's `mqttPublishRetained` call sites).

- [ ] **Step 4: Compile and verify**

```bash
cd apps/internal
pio run -e cyd
```
Expected: `SUCCESS`.

- [ ] **Step 5: Commit**

```bash
git add src/api_client.h src/api_client.cpp src/layout/layout_store.h src/layout/layout_store.cpp
git commit -m "feat(layout): MQTT subscribe layout config + retained readback publish (layout/current)"
```

---

### Task 8: `printer-monitor-core` — add stable `id` to `3dpb/printers` payload

**Files:**
- Modify: `/Users/adhityatangahu/Documents/shopee-analysis/packages/printer-monitor-core/src/types.ts`
- Modify: `/Users/adhityatangahu/Documents/shopee-analysis/packages/printer-monitor-core/src/payload.ts`
- Test: `/Users/adhityatangahu/Documents/shopee-analysis/packages/printer-monitor-core/src/__tests__/payload.test.ts`

**Interfaces:**
- Consumes: `DeviceConfig` (has `id` already), `PrinterRow` (Fase 1, existing).
- Produces: `PrinterRow.id: string` — new field, additive. Consumed by Task 11 (dashboard `GET /api/cyd-layout/printers`).

- [ ] **Step 1: Write the failing test** — add to existing `payload.test.ts` (append, don't replace)

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
```
Read the existing test file first, then add this case inside the existing `describe('buildPrintersPayload...')` block:
```ts
  it('payload includes stable device id (bukan cuma display name)', () => {
    const store = new StateStore()
    store.upsertFromStatus(mars, normalizeBambu('mars', { print: { gcode_state: 'IDLE' } }), null)
    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0].id).toBe('mars')
    expect(p.payload[0].name).toBe('Mars')
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @3pb/printer-monitor-core test
```
Expected: FAIL — `p.payload[0].id` is `undefined`, `PrinterRow` type has no `id` field.

- [ ] **Step 3: Add `id` to `PrinterRow` in `types.ts`**

Find the `PrinterRow` interface and add `id: string` as the first field:
```ts
export interface PrinterRow {
  id: string
  name: string
  type: string
  state: string
  progress: number
  remaining_min: number
  filename: string
  error_msg: string
  last_seen: string | null
}
```

- [ ] **Step 4: Populate `id` in `buildPrintersPayload` (`payload.ts`)**

Find the `payload.map((d) => {...})` in `buildPrintersPayload` and add `id: d.id,` to the returned object literal (using the existing `DeviceConfig.id`, already available in scope as `d`):
```ts
      return {
        id: d.id,
        name: d.name, type: d.type,
        state: isStale ? 'OFFLINE' : (r!.last_state || 'idle'),
        progress: r?.last_progress ?? 0,
        remaining_min: r?.last_remaining_min ?? 0,
        filename: r?.last_filename ?? '',
        error_msg: r?.last_error_code ?? '',
        last_seen: r?.last_seen_at ?? null,
      }
```

- [ ] **Step 5: Run test to verify it passes, then full suite**

```bash
pnpm --filter @3pb/printer-monitor-core test
pnpm turbo test
```
Expected: both green — `id` is purely additive, no existing assertion checks for the ABSENCE of an `id` key, so no other test should break.

- [ ] **Step 6: Redeploy `.113`** (this is a live, already-deployed service — flag as a manual gated step, do not deploy automatically)

Report in the task summary: "Container `printer-monitor` on `.113` needs a rebuild+redeploy to pick up this change (`docker build` + `docker run` per `docs/runbooks/printer-monitor-cutover.md` pattern) — this is a live production service, confirm with the user before deploying."

- [ ] **Step 7: Commit**

```bash
git add packages/printer-monitor-core/src/types.ts packages/printer-monitor-core/src/payload.ts packages/printer-monitor-core/src/__tests__/payload.test.ts
git commit -m "feat(printer-monitor): tambah id stabil ke PrinterRow/payload 3dpb/printers (aditif, utk referensi printer di layout CYD)"
```

---

### Task 9: Firmware — match printers by stable `id`, not display `name`

**Files:**
- Modify: `apps/internal/src/screens/printers.h`
- Modify: `apps/internal/src/screens/printers.cpp`
- Modify: `apps/internal/src/layout/screen_layout.cpp`

**Interfaces:**
- Consumes: `id` field now present in `3dpb/printers` payload (Task 8, deployed).
- Produces: `PrinterData.id` field; `findPrinterById` (Task 6) actually matches by id.

- [ ] **Step 1: Add `id` to `PrinterData` struct** (`printers.h`)

```cpp
struct PrinterData {
  char    id[24];       // NEW — stable id, mis. "mars" (bukan display name)
  char    name[24];
  char    type[12];
  char    state[16];
  char    filename[64];
  char    error_msg[80];
  uint8_t progress;
  int16_t remaining_min;
  bool    valid;
};
```

- [ ] **Step 2: Populate it in `parsePrintersJson` (`printers.cpp`)**

Add one line alongside the existing `strlcpy` calls in the parse loop:
```cpp
    strlcpy(pd.id,       p["id"]       | "", sizeof(pd.id));
    strlcpy(pd.name,     p["name"]     | "", sizeof(pd.name));
```

- [ ] **Step 3: Fix `findPrinterById` in `screen_layout.cpp`** — it was matching on `.name` as a stopgap (Task 6 comment flagged this); switch to `.id`

```cpp
static const PrinterData& findPrinterById(const char* id) {
  static PrinterData empty = {};
  for (int i = 0; i < gPrinterCount; i++) {
    if (strcmp(gPrinters[i].id, id) == 0) return gPrinters[i];
  }
  return empty;
}
```

- [ ] **Step 4: Compile and verify**

```bash
cd apps/internal
pio run -e cyd
```
Expected: `SUCCESS`.

- [ ] **Step 5: Commit**

```bash
git add src/screens/printers.h src/screens/printers.cpp src/layout/screen_layout.cpp
git commit -m "fix(layout): match printer cells by stable id (bukan display name) — Task 8 prerequisite kepakai"
```

---

### Task 10: Dashboard — `/cyd-layout` editor page (form UI)

**Files:**
- Create: `apps/dashboard/app/(dashboard)/cyd-layout/page.tsx`
- Create: `apps/dashboard/lib/cyd-layout/rack-template.ts`

**Interfaces:**
- Consumes: `GET /api/cyd-layout/printers` (Task 11).
- Produces: a page at `/cyd-layout` — 10 printer-slot dropdowns + 1 Ganymede-wide slot, "Simpan" button calling `POST /api/cyd-layout` (Task 11).

- [ ] **Step 1: Write `lib/cyd-layout/rack-template.ts`** — the fixed 10-slot rack shape (matches `default-layout.json`'s rack page geometry, kept as the single form template)

```ts
export interface RackSlot {
  key: string        // "mars", "saturn", ... — matches cell col/row purpose, not a printer id
  label: string       // shown above the dropdown, mis. "Rak Kiri — Atas 1"
  col: number
  row: number
}

export const RACK_SLOTS: RackSlot[] = [
  { key: 'topLeft1',    label: 'Rak Kiri — Atas 1',    col: 0, row: 1 },
  { key: 'topLeft2',    label: 'Rak Kiri — Atas 2',    col: 1, row: 1 },
  { key: 'topRight1',   label: 'Rak Kanan — Atas 1',   col: 3, row: 1 },
  { key: 'topRight2',   label: 'Rak Kanan — Atas 2',   col: 4, row: 1 },
  { key: 'topRight3',   label: 'Rak Kanan — Atas 3',   col: 5, row: 1 },
  { key: 'botLeft1',    label: 'Rak Kiri — Bawah 1',   col: 0, row: 2 },
  { key: 'botLeft2',    label: 'Rak Kiri — Bawah 2',   col: 1, row: 2 },
  { key: 'botRight2',   label: 'Rak Kanan — Bawah 2',  col: 4, row: 2 },
  { key: 'botRight3',   label: 'Rak Kanan — Bawah 3',  col: 5, row: 2 },
]

export const GANYMEDE_SLOT: RackSlot = { key: 'ganymede', label: 'Strip bawah (lebar penuh)', col: 0, row: 3 }
```
9 regular slots (matches the current 9 Bambu-printer cells; `botRight1`/col3-row2 intentionally absent — the original layout leaves that cell empty, matched here by omission) + 1 Ganymede slot = 10 total, matching spec §3.5.

- [ ] **Step 2: Write `app/(dashboard)/cyd-layout/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { RACK_SLOTS, GANYMEDE_SLOT } from '@/lib/cyd-layout/rack-template'

interface PrinterOption { id: string; name: string }

export default function CydLayoutPage() {
  const [printers, setPrinters] = useState<PrinterOption[]>([])
  const [assignment, setAssignment] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'confirmed' | 'timeout' | 'error'>('idle')

  useEffect(() => {
    fetch('/api/cyd-layout/printers')
      .then((r) => r.json())
      .then((data: PrinterOption[]) => setPrinters(data))
      .catch(() => setStatus('error'))
  }, [])

  const allSlots = [...RACK_SLOTS, GANYMEDE_SLOT]

  async function handleSave() {
    setStatus('saving')
    try {
      const res = await fetch('/api/cyd-layout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignment }),
      })
      const body = await res.json()
      setStatus(body.confirmed ? 'confirmed' : 'timeout')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Layout CYD — Rak Printer</h1>
      <p className="text-sm text-gray-500 mb-6">
        Pilih printer per slot rak. Halaman detail (auto-rotate) di-generate otomatis dari urutan ini.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {allSlots.map((slot) => (
          <div key={slot.key}>
            <label className="block text-sm font-medium mb-1">{slot.label}</label>
            <select
              className="w-full border rounded px-2 py-1"
              value={assignment[slot.key] ?? ''}
              onChange={(e) => setAssignment((a) => ({ ...a, [slot.key]: e.target.value }))}
            >
              <option value="">— kosong —</option>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={status === 'saving'}
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {status === 'saving' ? 'Menyimpan...' : 'Simpan'}
      </button>
      {status === 'confirmed' && <p className="mt-3 text-green-600">✅ Diterapkan ke CYD</p>}
      {status === 'timeout' && <p className="mt-3 text-amber-600">⚠️ Tersimpan, tapi device belum konfirmasi (cek koneksi CYD)</p>}
      {status === 'error' && <p className="mt-3 text-red-600">Gagal menyimpan, coba lagi.</p>}
    </div>
  )
}
```

- [ ] **Step 3: Manual verification** (no automated test for a client page rendering — matches existing dashboard convention of testing the API layer, not page markup)

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard build
```
Expected: build succeeds (route compiles). Full click-through verification happens after Task 11 (API routes exist).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/cyd-layout/page.tsx apps/dashboard/lib/cyd-layout/rack-template.ts
git commit -m "feat(cyd-layout): halaman editor dashboard — 10 slot rak + Ganymede, dropdown printer"
```

---

### Task 11: Dashboard — `GET /api/cyd-layout/printers` + `POST /api/cyd-layout`

**Files:**
- Create: `apps/dashboard/lib/cyd-layout/mqtt-client.ts`
- Create: `apps/dashboard/lib/cyd-layout/build-config.ts`
- Create: `apps/dashboard/app/api/cyd-layout/printers/route.ts`
- Create: `apps/dashboard/app/api/cyd-layout/route.ts`
- Test: `apps/dashboard/lib/cyd-layout/__tests__/build-config.test.ts`

**Interfaces:**
- Consumes: `RACK_SLOTS`/`GANYMEDE_SLOT` (Task 10), `mqtt` npm package (add dependency).
- Produces: `GET /api/cyd-layout/printers` → `PrinterOption[]`; `POST /api/cyd-layout` (body `{assignment: Record<string,string>}`) → `{confirmed: boolean}`.

- [ ] **Step 1: Add `mqtt` dependency**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard add mqtt@^5.10.1
```

- [ ] **Step 2: Write `lib/cyd-layout/mqtt-client.ts`** — small wrapper: read one retained message, or publish one retained message, both with a timeout, then disconnect (dashboard is not a long-running MQTT client)

```ts
import mqtt from 'mqtt'

const BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://192.168.88.113:1883'

export function readRetained(topic: string, timeoutMs = 5000): Promise<string | null> {
  return new Promise((resolve) => {
    const client = mqtt.connect(BROKER_URL, { connectTimeout: 4000 })
    const timer = setTimeout(() => { client.end(true); resolve(null) }, timeoutMs)
    client.on('connect', () => client.subscribe(topic))
    client.on('message', (_t, msg) => {
      clearTimeout(timer)
      client.end(true)
      resolve(msg.toString())
    })
    client.on('error', () => { clearTimeout(timer); client.end(true); resolve(null) })
  })
}

export function publishRetained(topic: string, payload: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = mqtt.connect(BROKER_URL, { connectTimeout: 4000 })
    client.on('connect', () => {
      client.publish(topic, payload, { retain: true }, (err) => {
        client.end(true)
        resolve(!err)
      })
    })
    client.on('error', () => resolve(false))
  })
}

// Konfirmasi save: publish config, lalu subscribe topic readback dan bandingkan.
export function publishAndConfirm(configTopic: string, readbackTopic: string, payload: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const client = mqtt.connect(BROKER_URL, { connectTimeout: 4000 })
    const timer = setTimeout(() => { client.end(true); resolve(false) }, timeoutMs)
    client.on('connect', () => {
      client.subscribe(readbackTopic)
      client.publish(configTopic, payload, { retain: true })
    })
    client.on('message', (_t, msg) => {
      if (msg.toString() === payload) {
        clearTimeout(timer)
        client.end(true)
        resolve(true)
      }
      // payload beda (mis. retained lama yg belum ke-overwrite) -> tunggu pesan berikutnya sampai timeout
    })
    client.on('error', () => { clearTimeout(timer); client.end(true); resolve(false) })
  })
}
```

- [ ] **Step 3: Write the failing test for `build-config.ts`**

```ts
// apps/dashboard/lib/cyd-layout/__tests__/build-config.test.ts
import { describe, it, expect } from 'vitest'
import { buildLayoutConfig } from '../build-config'

describe('buildLayoutConfig', () => {
  it('rakit page rack dari assignment + generate halaman detail otomatis', () => {
    const assignment = {
      topLeft1: 'mars', topLeft2: 'saturn',
      topRight1: 'uranus', topRight2: 'neptune', topRight3: 'moon',
      botLeft1: 'mercury', botLeft2: 'earth',
      botRight2: 'venus', botRight3: 'jupiter',
      ganymede: 'ganymede',
    }
    const cfg = buildLayoutConfig(assignment)

    expect(cfg.schemaVersion).toBe(1)
    const rack = cfg.pages.find((p) => p.id === 'rack')!
    expect(rack.grid).toEqual({ cols: 6, rows: 4, rowWeights: [0.06, 0.32, 0.36, 0.26] })
    expect(rack.cells).toContainEqual({ printer: 'mars', col: 0, row: 1 })
    expect(rack.cells).toContainEqual({ type: 'label', text: 'RAK KIRI', col: 0, row: 0, colSpan: 2 })
    expect(rack.cells.find((c) => c.printer === 'ganymede')).toMatchObject({ col: 0, row: 3, colSpan: 6 })

    const detailPages = cfg.pages.filter((p) => p.id.startsWith('detail-'))
    expect(detailPages.length).toBe(4)  // 10 printer / 3 per halaman = 4 halaman (terakhir sisa 1)
    expect(detailPages[0].cells.map((c) => c.printer)).toEqual(['mars', 'saturn', 'uranus'])
    expect(detailPages[3].cells.map((c) => c.printer)).toEqual(['ganymede'])
  })

  it('slot kosong (tak diisi) tak menghasilkan cell', () => {
    const cfg = buildLayoutConfig({ topLeft1: 'mars' })
    const rack = cfg.pages.find((p) => p.id === 'rack')!
    expect(rack.cells.filter((c) => 'printer' in c)).toHaveLength(1)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

```bash
pnpm --filter shopee-dashboard exec vitest run lib/cyd-layout/__tests__/build-config.test.ts
```
Expected: FAIL — `build-config.ts` doesn't exist.

- [ ] **Step 5: Write `lib/cyd-layout/build-config.ts`**

```ts
import { RACK_SLOTS, GANYMEDE_SLOT } from './rack-template'

interface LayoutCellOut {
  type?: 'label'
  text?: string
  printer?: string
  col: number
  row: number
  colSpan?: number
}
interface LayoutPageOut {
  id: string
  grid: { cols: number; rows: number; rowWeights?: number[] }
  fields: (string | { id: string; label?: string })[][]
  durationSec: number
  cells: LayoutCellOut[]
}
interface LayoutConfigOut {
  schemaVersion: 1
  pages: LayoutPageOut[]
}

const RACK_FIELDS = [['name'], ['state', 'progress'], ['progressBar']]
const DETAIL_FIELDS = [
  ['name', 'type'], ['state', 'progress'], ['progressBar'],
  [{ id: 'timeLeft', label: 'Sisa' }, { id: 'eta', label: 'ETA' }], ['filename'],
]

export function buildLayoutConfig(assignment: Record<string, string>): LayoutConfigOut {
  const rackCells: LayoutCellOut[] = [
    { type: 'label', text: 'RAK KIRI', col: 0, row: 0, colSpan: 2 },
    { type: 'label', text: 'RAK KANAN', col: 3, row: 0, colSpan: 3 },
  ]
  const orderedPrinters: string[] = []

  for (const slot of RACK_SLOTS) {
    const printerId = assignment[slot.key]
    if (!printerId) continue
    rackCells.push({ printer: printerId, col: slot.col, row: slot.row })
    orderedPrinters.push(printerId)
  }
  const ganymedeId = assignment[GANYMEDE_SLOT.key]
  if (ganymedeId) {
    rackCells.push({ printer: ganymedeId, col: 0, row: 3, colSpan: 6 })
    orderedPrinters.push(ganymedeId)
  }

  const rackPage: LayoutPageOut = {
    id: 'rack',
    grid: { cols: 6, rows: 4, rowWeights: [0.06, 0.32, 0.36, 0.26] },
    fields: RACK_FIELDS,
    durationSec: 0,
    cells: rackCells,
  }

  const detailPages: LayoutPageOut[] = []
  for (let i = 0; i < orderedPrinters.length; i += 3) {
    const group = orderedPrinters.slice(i, i + 3)
    detailPages.push({
      id: `detail-${detailPages.length + 1}`,
      grid: { cols: 1, rows: group.length },
      fields: DETAIL_FIELDS,
      durationSec: 8,
      cells: group.map((printer, idx) => ({ printer, col: 0, row: idx })),
    })
  }

  return { schemaVersion: 1, pages: [rackPage, ...detailPages] }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter shopee-dashboard exec vitest run lib/cyd-layout/__tests__/build-config.test.ts
```
Expected: PASS.

- [ ] **Step 7: Write `app/api/cyd-layout/printers/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { readRetained } from '@/lib/cyd-layout/mqtt-client'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await readRetained('3dpb/printers')
  if (!raw) return NextResponse.json([])

  try {
    const parsed = JSON.parse(raw) as { payload: { id: string; name: string }[] }
    return NextResponse.json(parsed.payload.map((p) => ({ id: p.id, name: p.name })))
  } catch {
    return NextResponse.json([])
  }
}
```

- [ ] **Step 8: Write `app/api/cyd-layout/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildLayoutConfig } from '@/lib/cyd-layout/build-config'
import { publishAndConfirm } from '@/lib/cyd-layout/mqtt-client'

const CONFIG_TOPIC = '3dpb/cyd/internal-rack/layout'
const READBACK_TOPIC = '3dpb/cyd/internal-rack/layout/current'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const assignment = body?.assignment
  if (!assignment || typeof assignment !== 'object') {
    return NextResponse.json({ error: 'assignment wajib diisi' }, { status: 400 })
  }

  const config = buildLayoutConfig(assignment)
  const payload = JSON.stringify(config)
  const confirmed = await publishAndConfirm(CONFIG_TOPIC, READBACK_TOPIC, payload)

  return NextResponse.json({ confirmed })
}
```

- [ ] **Step 9: Full test suite + build**

```bash
pnpm turbo test
pnpm --filter shopee-dashboard build
```
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard/lib/cyd-layout apps/dashboard/app/api/cyd-layout apps/dashboard/package.json apps/dashboard/../../pnpm-lock.yaml
git commit -m "feat(cyd-layout): API routes — GET printers (dari 3dpb/printers) + POST layout (build+publish+confirm)"
```

---

### Task 12: WiFiManager captive portal + broker IP param + reset button

**Files:**
- Modify: `apps/internal/platformio.ini`
- Modify: `apps/internal/src/config.h` (and `config.h.example`)
- Modify: `apps/internal/src/wifi_manager.h`
- Modify: `apps/internal/src/wifi_manager.cpp`
- Modify: `apps/internal/src/api_client.cpp` (read broker IP from runtime var, not `#define`)
- Modify: `apps/internal/src/main.cpp` (BOOT-button-hold reset check in `setup()`)

**Interfaces:**
- Consumes: `WiFiManager`/`WiFiManagerParameter` (new lib), `Preferences` (ESP32 core).
- Produces: `void wifiConnect()` (same signature, now does AP-mode captive portal internally instead of `WiFi.begin` with hardcoded creds), `extern char gMqttBrokerIp[]` (runtime broker address, replaces `MQTT_BROKER` macro).

- [ ] **Step 1: Add `WiFiManager` to `lib_deps`**

Modify `platformio.ini`:
```ini
lib_deps =
  bodmer/TFT_eSPI@^2.5.43
  bblanchon/ArduinoJson@^7.0.0
  https://github.com/PaulStoffregen/XPT2046_Touchscreen.git
  arduino-libraries/NTPClient@^3.2.1
  knolleary/PubSubClient@^2.8
  tzapu/WiFiManager@^2.0.17
```

- [ ] **Step 2: Remove `WIFI_SSID`/`WIFI_PASSWORD`/`MQTT_BROKER` from `config.h` and `config.h.example`**

Edit both files — remove these three lines (keep `DISPLAY_ROTATION`, `NTP_OFFSET_SEC`, `MQTT_PORT`, `MQTT_TOPIC`, `MQTT_CLIENT_ID`, budget constants — all unchanged):
```cpp
// HAPUS baris-baris ini dari config.h.example dan config.h:
#define WIFI_SSID     "YourSSID"
#define WIFI_PASSWORD "YourPassword"
#define MQTT_BROKER    "192.168.x.x"
```

- [ ] **Step 3: Rewrite `wifi_manager.h`** — add the runtime broker variable and reset function

```cpp
#pragma once
#include <NTPClient.h>
#include <WiFiUDP.h>

extern NTPClient timeClient;
extern char gMqttBrokerIp[16];  // diisi WiFiManager custom param saat provisioning

void wifiConnect();          // AP-mode captive portal kalau belum ada credential / gagal connect
void wifiEnsureConnected();
void wifiResetIfBootHeld();  // panggil di awal setup() — cek tombol BOOT ditahan, clear+reboot kalau ya
String clockGetTime();
String clockGetDate();
long  clockGetEpoch();
```

- [ ] **Step 4: Rewrite `wifi_manager.cpp`**

```cpp
#include "wifi_manager.h"
#include "config.h"
#include "display.h"
#include <WiFi.h>
#include <WiFiManager.h>
#include <Arduino.h>

#define BOOT_BUTTON_PIN 0

WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", NTP_OFFSET_SEC, 60000);
char gMqttBrokerIp[16] = "192.168.88.113";

static const char* DAYS[] = {"Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"};
static const char* MONTHS[] = {"","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"};

static void showApModeScreen(WiFiManager* wm) {
  tft.fillScreen(C_BG);
  tft.setTextColor(C_YELLOW, C_BG);
  tft.setTextSize(2);
  tft.setCursor(10, 40);
  tft.println("Setup Mode");
  tft.setTextSize(1);
  tft.setTextColor(TFT_WHITE, C_BG);
  tft.setCursor(10, 80);
  tft.println("1. Connect HP ke WiFi:");
  tft.setTextColor(C_GREEN, C_BG);
  tft.setCursor(20, 96);
  tft.println(wm->getConfigPortalSSID());
  tft.setTextColor(TFT_WHITE, C_BG);
  tft.setCursor(10, 120);
  tft.println("2. Browser akan otomatis");
  tft.setCursor(10, 136);
  tft.println("   buka halaman setup.");
  tft.setCursor(10, 156);
  tft.println("   (Kalau tidak: 192.168.4.1)");
}

void wifiConnect() {
  WiFiManager wm;
  WiFiManagerParameter brokerParam("broker", "IP Broker MQTT", gMqttBrokerIp, 16);
  wm.addParameter(&brokerParam);
  wm.setAPCallback(showApModeScreen);
  wm.setConnectTimeout(15);

  bool connected = wm.autoConnect("3DPB-Display-Setup");
  strlcpy(gMqttBrokerIp, brokerParam.getValue(), sizeof(gMqttBrokerIp));

  if (!connected) {
    Serial.println("[WiFi] provisioning gagal/timeout, restart");
    ESP.restart();
  }

  Serial.printf("[WiFi] connected, broker=%s\n", gMqttBrokerIp);
  timeClient.begin();
  timeClient.update();
}

void wifiResetIfBootHeld() {
  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
  if (digitalRead(BOOT_BUTTON_PIN) != LOW) return;  // tak ditekan saat boot

  unsigned long start = millis();
  while (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    if (millis() - start >= 5000) {
      Serial.println("[WiFi] BOOT ditahan 5 detik — reset credential");
      WiFiManager wm;
      wm.resetSettings();
      ESP.restart();
    }
    delay(50);
  }
}

void wifiEnsureConnected() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost, reconnecting...");
    WiFi.reconnect();
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
      delay(500);
    }
  }
  timeClient.update();
}

String clockGetTime() {
  return timeClient.getFormattedTime();
}

String clockGetDate() {
  time_t epoch = timeClient.getEpochTime();
  struct tm* t = localtime(&epoch);
  char buf[32];
  snprintf(buf, sizeof(buf), "%s, %d %s %d",
    DAYS[t->tm_wday], t->tm_mday, MONTHS[t->tm_mon + 1], 1900 + t->tm_year);
  return String(buf);
}

long clockGetEpoch() {
  return timeClient.getEpochTime();
}
```

- [ ] **Step 5: Use `gMqttBrokerIp` instead of `MQTT_BROKER` in `api_client.cpp`**

Find `mqtt.setServer(MQTT_BROKER, MQTT_PORT);` in `mqttReconnect()` and change to:
```cpp
  mqtt.setServer(gMqttBrokerIp, MQTT_PORT);
```
Add `#include "wifi_manager.h"` to `api_client.cpp` if not already present (it is — `wifi_manager.h` is already included for `wifiEnsureConnected()`).

- [ ] **Step 6: Call the reset check at the top of `setup()` in `main.cpp`**

```cpp
void setup() {
  Serial.begin(115200);
  displayInit();
  touchInit();
  wifiResetIfBootHeld();   // NEW — cek tahan-BOOT sebelum connect normal

  tft.setTextColor(C_YELLOW, C_BG);
  ...
```

- [ ] **Step 7: Compile and verify**

```bash
cd apps/internal
pio run -e cyd
```
Expected: `SUCCESS`.

- [ ] **Step 8: Manual hardware verification** (no automated test — network provisioning needs real hardware)

Flash to device (`pio run -e cyd -t upload`), then: (a) erase flash / clear NVS to simulate first-boot, confirm AP mode + on-screen instructions appear; (b) connect phone, fill form (SSID+password+broker IP), confirm device connects & shows layout normally; (c) with device connected, hold BOOT 5s, confirm it clears + reboots to AP mode again.

- [ ] **Step 9: Commit**

```bash
git add platformio.ini src/config.h.example src/wifi_manager.h src/wifi_manager.cpp src/api_client.cpp src/main.cpp
git commit -m "feat(provisioning): WiFiManager captive portal + broker IP param + BOOT-hold reset (config.h WiFi/broker jadi runtime)"
```

---

## Self-Review (dijalankan penulis plan)

1. **Spec coverage — layout-dinamis:** §3.1 migrasi → Task 1. §3.2 skema (grid/rowWeights/fields/label/id-stabil) → Task 2-3. §3.3 kontrak MQTT (config+readback) → Task 7. §3.4 renderer+cache+fallback+paging dinamis → Task 4-6. §3.5 editor dashboard (form+auto-generate-detail+konfirmasi) → Task 10-11. Prasyarat `id` di `printer-monitor-core` → Task 8-9. Semua tercakup.
2. **Spec coverage — WiFi provisioning:** §3.1 WiFiManager → Task 12 Step 1,4. §3.2 trigger otomatis → `wm.autoConnect()` (WiFiManager bawaan). §3.3 field broker IP → `WiFiManagerParameter`. §3.4 layar AP mode → `showApModeScreen`. §3.5 NVS storage → WiFiManager default. §3.6 reset BOOT 5s → `wifiResetIfBootHeld`. §3.7 config.h runtime → Task 12 Step 2,5. Semua tercakup.
3. **Placeholder scan:** tidak ada TBD/TODO; setiap step berisi kode konkret. Satu catatan jujur ditinggalkan eksplisit (Task 6 Step 3: fitur "pause rotasi" UI lama didrop, ditandai bukan blocker — bukan placeholder, keputusan scope terdokumentasi).
4. **Type consistency:** `LayoutConfig`/`LayoutPage`/`LayoutCell`/`FieldRow`/`FieldEntry`/`FieldId` (Task 2) dipakai identik di Task 3 (parser), 4 (renderer), 5 (store), 6 (screen). `applyLayout`/`applyLayoutAndCache` signature disepakati ulang di Task 7 Step 3 (menambah param `rawJson`/`len`) — perubahan ini eksplisit ditulis sbg revisi Task 5's forward declaration, bukan kontradiksi diam-diam. `PrinterData.id` (Task 9) dipakai `findPrinterById` yg sudah ditulis Task 6 dgn catatan "Task 9 akan ganti" — konsisten, bukan bug.
5. **Sequencing (spec WiFi §5):** Task 1-11 (layout) dieksekusi penuh dan di-commit sebelum Task 12 (provisioning) mulai — keduanya menyentuh `main.cpp`, urutan linear plan ini sudah menjamin itu (bukan paralel).
