// SPDX-FileCopyrightText: 2026 Iron Fleet Developers
// SPDX-License-Identifier: AGPL-3.0-or-later

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Serializes to the exact schema expected by Kodiak `kodiak_client::UvSpriteSheet`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UvSpriteSheet {
    pub sprites: BTreeMap<String, UvSprite>,
    pub animations: BTreeMap<String, Vec<UvSprite>>,
}

impl UvSpriteSheet {
    pub fn new() -> Self {
        Self {
            sprites: BTreeMap::new(),
            animations: BTreeMap::new(),
        }
    }
}

impl Default for UvSpriteSheet {
    fn default() -> Self {
        Self::new()
    }
}

/// UV coordinates and aspect ratio for an individual sprite or animation frame.
/// Counter-clockwise quad starting from bottom-left:
/// [pos + vec2(0.0, dim.y), pos + dim, pos + vec2(dim.x, 0.0), pos] / sheet_dims
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UvSprite {
    pub uvs: [[f32; 2]; 4],
    pub aspect: f32,
}

impl UvSprite {
    pub fn new(pos_x: u32, pos_y: u32, width: u32, height: u32, sheet_w: u32, sheet_h: u32) -> Self {
        let px = pos_x as f32;
        let py = pos_y as f32;
        let w = width as f32;
        let h = height as f32;
        let sw = sheet_w as f32;
        let sh = sheet_h as f32;

        /*
        D (pos.x, pos.y)        --- C (pos.x + dim.x, pos.y)
        |                         / |
        A (pos.x, pos.y + dim.y) --- B (pos.x + dim.x, pos.y + dim.y)
        */
        let uvs = [
            [px / sw, (py + h) / sh],       // A: bottom-left
            [(px + w) / sw, (py + h) / sh], // B: bottom-right
            [(px + w) / sw, py / sh],       // C: top-right
            [px / sw, py / sh],             // D: top-left
        ];
        let aspect = if h > 0.0 { w / h } else { 1.0 };
        Self { uvs, aspect }
    }
}

/// Schema for CSS preview spritesheet (for client/src/ui/sprites_css.json).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CssSpriteSheet {
    pub width: u32,
    pub height: u32,
    pub sprites: BTreeMap<String, SpriteGeo>,
    pub animations: BTreeMap<String, Vec<SpriteGeo>>,
}

impl CssSpriteSheet {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            sprites: BTreeMap::new(),
            animations: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpriteGeo {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}
