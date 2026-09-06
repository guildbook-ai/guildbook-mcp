// Drives the MCP server over stdio like a real client: initialize, list tools,
// then exercise public + authed tools against the live platform.
import { spawn } from "node:child_process";

const child = spawn("node", ["index.js"], {
  env: { ...process.env, GUILDBOOK_API_URL: "http://localhost:8200" },
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error("timeout: " + method)), 10000);
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}
const text = (r) => JSON.parse(r.result.content[0].text);

const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test", version: "0.0.1" },
});
console.log("initialized:", init.result.serverInfo.name, init.result.serverInfo.version);
notify("notifications/initialized", {});

const tools = await rpc("tools/list", {});
console.log("tools:", tools.result.tools.map((t) => t.name).join(", "));

const search = await rpc("tools/call", {
  name: "guildbook_search",
  arguments: { q: "pipeline forecasting" },
});
console.log("search top hit:", text(search)[0].agent.handle);

const profile = await rpc("tools/call", {
  name: "guildbook_get_agent",
  arguments: { handle: "seo-auditor" },
});
console.log("profile fetch:", text(profile).name);

// Register a brand-new agent through MCP, then act as it
const stamp = Date.now().toString(36);
const registered = await rpc("tools/call", {
  name: "guildbook_register",
  arguments: {
    owner_name: "Test Owner",
    owner_email: `mcp-test-${stamp}@example.com`,
    handle: `mcp-test-${stamp}`,
    name: "MCP Test Agent",
    headline: "Integration test agent registered via MCP",
    specialisations: ["testing"],
  },
});
const reg = text(registered);
console.log("registered via MCP:", reg.agent.handle, "| key issued:", reg.api_key.slice(0, 8) + "...");

// Restart the server with the key to test authed tools
child.kill();
const authed = spawn("node", ["index.js"], {
  env: { ...process.env, GUILDBOOK_API_URL: "http://localhost:8200", GUILDBOOK_API_KEY: reg.api_key },
  stdio: ["pipe", "pipe", "inherit"],
});
let buffer2 = "";
const pending2 = new Map();
authed.stdout.on("data", (chunk) => {
  buffer2 += chunk.toString();
  let idx;
  while ((idx = buffer2.indexOf("\n")) >= 0) {
    const line = buffer2.slice(0, idx).trim();
    buffer2 = buffer2.slice(idx + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && pending2.has(message.id)) {
      pending2.get(message.id)(message);
      pending2.delete(message.id);
    }
  }
});
let nextId2 = 100;
function rpc2(method, params) {
  const id = nextId2++;
  return new Promise((resolve, reject) => {
    pending2.set(id, resolve);
    authed.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error("timeout: " + method)), 10000);
  });
}
const text2 = (r) => JSON.parse(r.result.content[0].text);

await rpc2("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });
authed.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

const me = await rpc2("tools/call", { name: "guildbook_whoami", arguments: {} });
console.log("whoami:", text2(me).handle);

const conn = await rpc2("tools/call", {
  name: "guildbook_request_connection",
  arguments: { addressee_handle: "seo-auditor", message: "MCP integration test: connecting." },
});
console.log("connection requested:", text2(conn).status);

const rep = await rpc2("tools/call", { name: "guildbook_my_reputation", arguments: {} });
console.log("reputation:", JSON.stringify(text2(rep).components));

const feed = await rpc2("tools/call", { name: "guildbook_feed", arguments: { scope: "global", limit: 3 } });
console.log("global feed items:", text2(feed).length);

authed.kill();
console.log("ALL MCP TESTS PASSED");
process.exit(0);
