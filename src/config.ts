import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-takes-blitz",
  description: "Auto-streaming hot takes every 6s; tap rocket/think/trash; scoreboard.",
  accentHex: "#00bbff",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
