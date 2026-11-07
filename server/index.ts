/**
 * NavalCommand.io Authoritative Server Entrypoint
 */

import { NavalWebSocketServer } from './netcode/ws_server.js';

export * from './core/game_server.js';
export * from './core/game_loop.js';
export * from './core/spatial_grid.js';
export * from './ai/bot_controller.js';
export * from './progression/tech_tree_service.js';
export * from './progression/loadout_validator.js';
export * from './netcode/ws_server.js';

// Start standalone server if invoked directly via CLI
const isMain = process.argv[1] && (process.argv[1].endsWith('server/index.ts') || process.argv[1].endsWith('server/index.js'));
if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  const server = new NavalWebSocketServer(port, 20, 12);
  server.start().then((boundPort) => {
    console.log(`[NavalCommand.io] Authoritative 20Hz Binary Server listening on ws://localhost:${boundPort}`);
  });
}
