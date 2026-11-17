# Iron Fleet (`naval_combat_rust`) — Developer Handoff & Runbook

## Environment / Setup

Iron Fleet targets Rust `nightly-2024-04-20` on `x86_64-pc-windows-gnu` (paired with `w64devkit` GCC/MinGW toolchain) and `wasm32-unknown-unknown` for the browser client.

Required tools:
- `rustup` with default toolchain `nightly-2024-04-20-x86_64-pc-windows-gnu` (configured in `rust-toolchain.toml`)
- Rust targets: `x86_64-pc-windows-gnu` and `wasm32-unknown-unknown`
- `w64devkit` (`gcc`, `ar`, `dlltool` on `PATH` — installed at `C:\Users\Administrator\bin\w64devkit\bin`)
- `trunk` (`0.21.x`, e.g., `0.21.14`) and `wasm-bindgen-cli` (`0.2.100`)
- `git` (`2.56.1`, `C:\Program Files\Git\cmd\git.exe`, with `core.longpaths = true` on Windows)
- `gh` (`2.104.0`, `C:\Program Files\GitHub CLI\gh.exe`)

Verify the local toolchain and workspace compilation:

```powershell
rustc --version
cargo --version
cargo check --bin server
```

## Architecture / Structure

- `Cargo.toml` — Root Cargo workspace (`resolver = "2"`) aggregating `common`, `server`, `client`, `macros`, and `tools/sprite_sheet_util`, with hoisted `[patch.crates-io]` (`yew-router`), `[patch."https://github.com/softbearstudios/kodiak"]` pointing to local `engine/` crates, and `[profile.dev]`/`[profile.test]` tuned (`debug = false`, `incremental = false`) to save disk space.
- `common/` — Shared game simulation constants (`GameConstants`: `Iron Fleet`, `ironfleet.io`), terrain generation, physics, and binary network protocol packets.
- `server/` — Authoritative game server (`kodiak_server`), CLI argument validation (`--port` upfront check in `server/src/main.rs`), and embedded static client assets (`client/dist/` via `minicdn`).
- `client/` — Yew + WebGL2/2D WASM client (`kodiak_client`), branding (`client/src/ui/logo.rs`, `client/index.html`, `client/data/manifest.json`), built with Trunk into `client/dist/`.
- `macros/` — Procedural macros crate.
- `tools/sprite_sheet_util/` — Offline PNG spritesheet atlas packer and UV JSON manifest generator.
- `engine/` — Standalone `softbearstudios/kodiak` (`0.2.0`, LGPL-3.0) engine workspace (`common`, `server`, `client`, `macros`, `plasma_protocol`).
- `tests/` — 4-tier PowerShell E2E verification suite (`run_e2e_tests.ps1`, 69 tests across Tiers 1–4) and JSON report output (`tests/reports/e2e_summary.json`).

## Build / Runbook / Instructions

Build the WASM client first so `client/dist/` exists for the server's `minicdn` asset embedding, then build the server and run tests:

```powershell
Set-Location client
trunk build --filehash false
Set-Location ..
cargo build --bin server
cargo test --workspace --no-fail-fast
```

Run the full 69-test E2E verification suite from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\run_e2e_tests.ps1
```

Inspect server CLI flags or run with an explicit port:

```powershell
.\target\debug\server.exe --help
```

## Roadmap / Next Steps

1. Fix PowerShell single-item string indexing in `tests/suites/Tier1_FeatureCoverage.ps1` (`T1.6.5`, line 473: wrap `@($spriteKeys)[0]`) and rebuild `server.exe` (`cargo build --bin server`) so `T2.9` and all 69/69 tests in `tests/run_e2e_tests.ps1` pass cleanly.
2. Refresh `tests/reports/e2e_summary.json` after full 69-test execution.
3. Expand client/browser E2E smoke tests and WebSocket multiplayer reconnect flows.

---

## GHI CHÚ BÀN GIAO CHO PHIÊN NGÀY MAI (Cập nhật 2026-11-17 21:44 UTC+7)

> **Tóm tắt trạng thái lúc dừng phiên hôm nay**: Dừng task `teamwork` theo yêu cầu người dùng để đẩy code đã hoàn thiện lên nhánh `rust-iron-fleet`, ngày mai tiếp tục hoàn tất kiểm thử 69/69 và phát triển tiếp.

### 1. Những gì ĐÃ LÀM XONG trong phiên hôm nay (2026-11-17)
1. **Khôi phục Workspace & Công cụ trên Windows**:
   - Đã khôi phục cấu trúc `C:\Users\Administrator\.gemini\antigravity\scratch\`:
     - `naval_combat_rust` (nhánh `rust-iron-fleet`)
     - `game` (82 files, 1,451,826 bytes từ nhánh `main` / `NavalCommand_SourceCode_20261112.zip`)
     - `game_m12_latest` (83 files, 1,041,709 bytes từ nhánh `main` / `NavalCommand_SourceCode_20261113_M12.zip`)
   - Đã cài đặt đầy đủ `rustup` (`nightly-2024-04-20-x86_64-pc-windows-gnu`), target `wasm32-unknown-unknown`, `trunk`, `w64devkit`, `git`, `gh`.
2. **Hoàn thành cả 4 hạng mục đang dang dở từ phiên 15/11**:
   - **`client/src/ui/logo.rs` & `client/index.html`**: Đã thêm `aria-label="Iron Fleet"` và `<title>{"Iron Fleet"}</title>` vào `<svg>` trong `logo.rs` (đã xác minh **PASS `T1.3.5`**); cập nhật `<title>Iron Fleet</title>` trong `client/index.html` (đã xác minh **PASS `T1.3.1`**).
   - **`server/src/main.rs`**: Đã thêm `validate_port_value` và `validate_port_args` kiểm tra `--port` trước khi gọi `entry_point::<Server>(...)`, trả lỗi rõ ràng ra `stderr` và `ExitCode::FAILURE` khi port ngoài `1..=65535` (kèm unit tests cho các case `--port 0`, `--port 70000`, `abc`, `-1`).
   - **`HANDOFF.md`**: Đã tạo runbook đầy đủ tại gốc repo (thỏa mãn `T1.10.3`, `T1.10.4`, `T4.4`).
   - **Root `Cargo.toml` + `Cargo.lock` + `engine/`**: Đã tạo workspace `Cargo.toml` ở gốc repo (kèm `[patch."https://github.com/softbearstudios/kodiak"]` trỏ về `engine/*`) và nạp mã nguồn `engine/` (`kodiak` tag `0.2.0`, 394 files, giữ nguyên `engine/LICENSE` LGPL-3.0 — đã xác minh **PASS `T1.2.1`–`T1.2.5`**, **`T1.4.3`**).
3. **Đồng bộ API & Build Client WASM**:
   - Đã nâng cấp các test cũ trong `common/src/protocol.rs`, `common/src/util.rs`, `server/src/entities.rs`, `server/src/entity.rs`, `server/src/noise.rs`, `server/src/team.rs`, `server/src/world_physics.rs`, `server/src/world_test.rs` để tương thích với `kodiak` 0.2.0 (`NonZeroU16`, `TempPlayer`, `bitcode`, `std::env::temp_dir()`).
   - Đã build xong WebAssembly client vào `client/dist/` (`index.html`, `client.js`, `client_bg.wasm`, `favicon.png`, `phrases.txt`).
4. **Kết quả kiểm tra nhanh trước khi dừng**:
   - Đã chạy thử `tests/run_e2e_tests.ps1 -SkipLong` từ `T1.1.1` tới `T1.6.5`:
     - **PASS**: `T1.1.1`–`T1.1.5`, `T1.2.1`–`T1.2.5`, `T1.3.1`–`T1.3.5`, `T1.4.1`–`T1.4.5`, `T1.5.1`–`T1.5.5`, `T1.6.1`–`T1.6.4`.
     - **Phát hiện cần sửa ở `T1.6.5`**: Lỗi `Error: Sprite s is missing 'aspect'` — nguyên nhân do PowerShell trong `Tier1_FeatureCoverage.ps1` dòng 470-473 khi manifest chỉ có 1 key (`"sample_ship"`) trả về `String` thay vì `Array`, nên `$spriteKeys[0]` lấy nhầm ký tự `'s'`.

### 2. Những gì CẦN LÀM TIẾP vào ngày mai (Next Steps cho phiên AI sau)
1. **Kiểm tra máy & khôi phục nhanh (nếu máy trạm reset sau khi tắt)**:
   - Kiểm tra `C:\Users\Administrator\.gemini\antigravity\scratch\` xem còn `naval_combat_rust`, `game` (82 files), `game_m12_latest` (83 files) và bộ toolchain (`rustc`, `cargo`, `trunk`, `w64devkit`) hay chưa. Nếu máy bị reset, clone lại repo nhánh `rust-iron-fleet`, giải nén 2 file zip ở nhánh `main` vào `scratch/game` & `scratch/game_m12_latest`, và cài lại `rustup` (`nightly-2024-04-20-x86_64-pc-windows-gnu` + target `wasm32-unknown-unknown`) + `trunk` + `w64devkit`.
   - Lưu ý: nếu ở thư mục `scratch/` có các thư mục của dự án khác như `kitradio-video-studio` hoặc file `antigravity-setup-note.txt`, kiểm thử `T1.10.5` sẽ báo lỗi vì chỉ cho phép `@("game", "game_m12_latest", "naval_combat_rust", "teamwork")`. Cần xử lý/dọn hoặc điều chỉnh phù hợp trước khi chạy full E2E.
   - Lưu ý dung lượng ổ `C:`: ổ `C:` chỉ có tổng ~60 GB (~10 GB trống sau khi build). Không bật lại `incremental` hoặc `debug = true` trong `[profile.dev]`/`[profile.test]` kẻo đầy ổ đĩa gây lỗi `os error 112`.
2. **Sửa 1 dòng bug test `T1.6.5` & Chạy Full Build + 69/69 E2E Tests**:
   - Trong `tests/suites/Tier1_FeatureCoverage.ps1` (khoảng dòng 470-473): đổi `$spriteKeys = ...` thành `$spriteKeys = @($manifest.sprites | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name)` để `$spriteKeys[0]` luôn lấy đúng tên sprite (`"sample_ship"`).
   - Chạy `Set-Location client; trunk build --filehash false; Set-Location ..; cargo build --bin server` (để tạo `target\debug\server.exe` cho `T2.9` và `T1.7.4`–`T1.7.5`).
   - Chạy toàn bộ `powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\run_e2e_tests.ps1` (không dùng `-SkipLong`) để xác nhận **69/69 PASS** và cập nhật mới `tests/reports/e2e_summary.json`.
3. **Commit & Push kết quả 69/69 PASS lên `rust-iron-fleet`**, sau đó tiếp tục phát triển tính năng game `Iron Fleet` theo yêu cầu tiếp theo của người dùng.
