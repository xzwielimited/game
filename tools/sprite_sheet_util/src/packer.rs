// SPDX-FileCopyrightText: 2026 Iron Fleet Developers
// SPDX-License-Identifier: AGPL-3.0-or-later

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

impl Rect {
    pub fn new(x: u32, y: u32, w: u32, h: u32) -> Self {
        Self { x, y, w, h }
    }

    pub fn area(&self) -> u64 {
        self.w as u64 * self.h as u64
    }

    pub fn contains(&self, w: u32, h: u32) -> bool {
        self.w >= w && self.h >= h
    }

    pub fn intersects(&self, other: &Rect) -> bool {
        self.x < other.x + other.w
            && self.x + self.w > other.x
            && self.y < other.y + other.h
            && self.y + self.h > other.y
    }
}

/// 2D Guillotine Bin Packer with Best Short Side Fit (BSSF) heuristic.
pub struct GuillotinePacker {
    pub width: u32,
    pub height: u32,
    free_rectangles: Vec<Rect>,
    placed_rectangles: Vec<Rect>,
}

impl GuillotinePacker {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            free_rectangles: vec![Rect::new(0, 0, width, height)],
            placed_rectangles: Vec::new(),
        }
    }

    pub fn placed(&self) -> &[Rect] {
        &self.placed_rectangles
    }

    /// Try to insert a rectangle of size (w, h). Returns the placed Rect or None if it doesn't fit.
    pub fn insert(&mut self, w: u32, h: u32) -> Option<Rect> {
        if w == 0 || h == 0 || w > self.width || h > self.height {
            return None;
        }

        // Find best free rectangle using Best Short Side Fit (BSSF)
        let mut best_index = None;
        let mut best_short = u32::MAX;
        let mut best_long = u32::MAX;

        for (i, free) in self.free_rectangles.iter().enumerate() {
            if free.contains(w, h) {
                let rem_w = free.w - w;
                let rem_h = free.h - h;
                let short_side = rem_w.min(rem_h);
                let long_side = rem_w.max(rem_h);

                if short_side < best_short || (short_side == best_short && long_side < best_long) {
                    best_short = short_side;
                    best_long = long_side;
                    best_index = Some(i);
                }
            }
        }

        let free_idx = best_index?;
        let free = self.free_rectangles.remove(free_idx);
        let placed = Rect::new(free.x, free.y, w, h);

        // Split free rect using Shorter Axis Split rule
        let rem_w = free.w - w;
        let rem_h = free.h - h;

        let (split_right, split_bottom) = if rem_w <= rem_h {
            (
                Rect::new(free.x + w, free.y, rem_w, h),
                Rect::new(free.x, free.y + h, free.w, rem_h),
            )
        } else {
            (
                Rect::new(free.x + w, free.y, rem_w, free.h),
                Rect::new(free.x, free.y + h, w, rem_h),
            )
        };

        if split_right.w > 0 && split_right.h > 0 {
            self.free_rectangles.push(split_right);
        }
        if split_bottom.w > 0 && split_bottom.h > 0 {
            self.free_rectangles.push(split_bottom);
        }

        self.placed_rectangles.push(placed);
        Some(placed)
    }
}

#[derive(Debug, Clone)]
pub struct PackItem<T> {
    pub id: T,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone)]
pub struct PackedItem<T> {
    pub id: T,
    pub rect: Rect,
}

/// Packs items with given padding into a 2D canvas.
/// If `allow_grow` is true, automatically expands dimensions to next power of two if initial size is insufficient.
pub fn pack_items<T: Clone>(
    mut items: Vec<PackItem<T>>,
    mut width: u32,
    mut height: u32,
    padding: u32,
    allow_grow: bool,
) -> Result<(u32, u32, Vec<PackedItem<T>>), String> {
    if items.is_empty() {
        return Err("No items to pack".to_string());
    }

    // Sort items by height descending, then width descending for optimal bin packing
    items.sort_by(|a, b| {
        let a_h = a.height + 2 * padding;
        let b_h = b.height + 2 * padding;
        b_h.cmp(&a_h).then_with(|| {
            let a_w = a.width + 2 * padding;
            let b_w = b.width + 2 * padding;
            b_w.cmp(&a_w)
        })
    });

    loop {
        let mut packer = GuillotinePacker::new(width, height);
        let mut packed = Vec::with_capacity(items.len());
        let mut all_fit = true;

        for item in &items {
            let req_w = item.width + 2 * padding;
            let req_h = item.height + 2 * padding;

            if let Some(placed) = packer.insert(req_w, req_h) {
                let inner = Rect::new(
                    placed.x + padding,
                    placed.y + padding,
                    item.width,
                    item.height,
                );
                packed.push(PackedItem {
                    id: item.id.clone(),
                    rect: inner,
                });
            } else {
                all_fit = false;
                break;
            }
        }

        if all_fit {
            return Ok((width, height, packed));
        }

        if !allow_grow {
            return Err(format!(
                "Failed to fit {} items into {}x{} atlas",
                items.len(),
                width,
                height
            ));
        }

        // Grow to next power of two
        if width <= height {
            width *= 2;
        } else {
            height *= 2;
        }

        if width > 16384 || height > 16384 {
            return Err(format!(
                "Atlas exceeded maximum size (16384x16384) while packing {} items",
                items.len()
            ));
        }
    }
}
