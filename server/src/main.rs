// SPDX-FileCopyrightText: 2024 Softbear, Inc.
// SPDX-License-Identifier: AGPL-3.0-or-later

#![feature(extract_if)]
#![feature(new_uninit)]
#![feature(get_mut_unchecked)]
#![feature(async_closure)]
#![feature(hash_extract_if)]
#![feature(type_alias_impl_trait)]
#![feature(impl_trait_in_assoc_type)]

//! The game server has authority over all game logic. Clients are served the client, which connects
//! via websocket.

mod arena;
mod bot;
mod collision;
mod complete_ref;
mod contact_ref;
mod entities;
mod entity;
mod entity_extension;
mod noise;
mod ordered_set;
mod player;
mod protocol;
mod server;
mod team;
mod terrain_pool;
mod world;
mod world_inbound;
mod world_mutation;
mod world_outbound;
mod world_physics;
mod world_physics_radius;
mod world_spawn;
#[cfg(test)]
mod world_test;

use crate::server::Server;
use kodiak_server::{entry_point, minicdn};
use std::process::ExitCode;

fn validate_port_value(raw: &str) -> Result<(), String> {
    if raw.is_empty() {
        return Err("error: invalid --port '': port must be an integer in 1..=65535".to_string());
    }
    match raw.parse::<u16>() {
        Ok(port) if (1..=65535).contains(&port) => Ok(()),
        Ok(0) => Err(
            "error: invalid --port '0': port is out of range (must be in 1..=65535)".to_string(),
        ),
        Ok(_) => unreachable!(),
        Err(_) => Err(format!(
            "error: invalid --port '{raw}': port is invalid or out of range (must be in 1..=65535)"
        )),
    }
}

fn validate_port_args<'a>(args: impl IntoIterator<Item = &'a str>) -> Result<(), String> {
    let mut iter = args.into_iter();
    while let Some(arg) = iter.next() {
        if arg == "--port" {
            let Some(val) = iter.next() else {
                return Err(
                    "error: missing value for --port (must be an integer in 1..=65535)".to_string(),
                );
            };
            validate_port_value(val)?;
        } else if let Some(val) = arg.strip_prefix("--port=") {
            validate_port_value(val)?;
        }
    }
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Err(err) = validate_port_args(args.iter().map(String::as_str)) {
        eprintln!("{err}");
        return ExitCode::FAILURE;
    }

    noise::init();

    entry_point::<Server>(minicdn::release_include_mini_cdn!("../../client/dist/"))
}

#[cfg(test)]
mod tests {
    use super::validate_port_args;

    #[test]
    fn test_validate_port_args_allows_absent_and_help() {
        assert!(validate_port_args(["--help"]).is_ok());
        assert!(validate_port_args(["--domain-backup", "domain_test.json", "--help"]).is_ok());
        assert!(validate_port_args(std::iter::empty::<&str>()).is_ok());
    }

    #[test]
    fn test_validate_port_args_accepts_valid_ports() {
        assert!(validate_port_args(["--port", "1"]).is_ok());
        assert!(validate_port_args(["--port", "8080"]).is_ok());
        assert!(validate_port_args(["--port=65535"]).is_ok());
    }

    #[test]
    fn test_validate_port_args_rejects_invalid_ports() {
        assert!(validate_port_args(["--port"]).is_err());
        assert!(validate_port_args(["--port="]).is_err());
        assert!(validate_port_args(["--port", "0"]).is_err());
        assert!(validate_port_args(["--port=0"]).is_err());
        assert!(validate_port_args(["--port", "70000"]).is_err());
        assert!(validate_port_args(["--port=70000"]).is_err());
        assert!(validate_port_args(["--port", "abc"]).is_err());
        assert!(validate_port_args(["--port", "-1"]).is_err());
    }
}
