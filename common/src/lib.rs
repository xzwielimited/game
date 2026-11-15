// SPDX-FileCopyrightText: 2024 Softbear, Inc.
// SPDX-License-Identifier: AGPL-3.0-or-later

#![feature(array_chunks)]
#![feature(test)]
#![feature(let_chains)]

use kodiak_common::{DefaultedGameConstants, GameConstants};

// Actually required see https://doc.rust-lang.org/beta/unstable-book/library-features/test.html
#[cfg(test)]
extern crate core;
#[cfg(test)]
extern crate test;

pub const MK48_CONSTANTS: &'static GameConstants = &GameConstants {
    game_id: "IronFleet",
    name: "Iron Fleet",
    domain: "ironfleet.io",
    geodns_enabled: true,
    trademark: "Iron Fleet",
    server_names: &[
        "Atlantic", "Pacific", "Fjord", "Kraken", "Scotia", "Barents", "Bering", "Chukchi",
    ],
    defaulted: DefaultedGameConstants::new(),
};

pub const IRON_FLEET_CONSTANTS: &'static GameConstants = MK48_CONSTANTS;

/// Public source code link shown in-game (AGPL-3.0 section 13: users interacting over a
/// network must be offered the Corresponding Source of the *modified* version).
/// TODO(before public deploy): push this fork to a public repository and point this URL at it.
/// Until then it points at the upstream project this fork is based on.
pub const SOURCE_CODE_URL: &str = "https://github.com/SoftbearStudios/mk48";

pub mod altitude;
pub mod angle;
pub mod complete;
pub mod contact;
pub mod death_reason;
pub mod entity;
pub mod guidance;
pub mod protocol;
pub mod terrain;
pub mod ticks;
pub mod transform;
pub mod util;
pub mod velocity;
pub mod world;
