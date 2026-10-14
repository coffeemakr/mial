import { execFile } from "child_process";
import fs from "fs";
import http2 from "http2";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import dns from "../dist/dns.js";

// Tests public DNS over HTTPS resolvers and writes the results as a table to README.md,
// between the resolvers:start and resolvers:end comments.
// Needs the compiled dns.js and curl with HTTP/3 support.

const RESOLVERS = [
  { name: "Cloudflare", endpoint: "https://cloudflare-dns.com/dns-query" },
  { name: "Google", endpoint: "https://dns.google/dns-query" },
  { name: "Control D (unfiltered)", endpoint: "https://freedns.controld.com/p0" },
  { name: "DNS.SB", endpoint: "https://doh.dns.sb/dns-query" },
  { name: "DNS4EU (unfiltered)", endpoint: "https://unfiltered.joindns4.eu/dns-query" },
  { name: "Digitale Gesellschaft", endpoint: "https://dns.digitale-gesellschaft.ch/dns-query" },
  { name: "Quad9", endpoint: "https://dns.quad9.net/dns-query" },
  { name: "SWITCH", endpoint: "https://dns.switch.ch/dns-query" },
  { name: "Mullvad", endpoint: "https://dns.mullvad.net/dns-query" },
];

// A resolver is supported if it answers all of these as expected
const EXPECTED_REASONS = [
  ["gmail.com", "mx"],
  ["example.com", "null-mx"],
  [`mial-${Date.now()}-does-not-exist.com`, "nxdomain"],
];

// The generated content in README.md is between these comments
const START_MARKER = "<!-- resolvers:start";
const END_MARKER = "<!-- resolvers:end";

// Origin sent with every request, like a browser does for cross-origin requests
const ORIGIN = "https://example.org";

const execFileAsync = promisify(execFile);

function toResponse(status, headers, body) {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (!name.startsWith(":") && value !== undefined) {
      result.set(name, Array.isArray(value) ? value.join(", ") : String(value));
    }
  }
  return new Response(body, { status, headers: result });
}

/** Fetch over HTTP/1.1, like the global fetch of Node.js before Node 26. */
function http1Fetch(url, init) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { ...init.headers, origin: ORIGIN }, signal: init.signal, ALPNProtocols: ["http/1.1"] },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(toResponse(response.statusCode, response.headers, Buffer.concat(chunks))));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}

/** Fetch over HTTP/2, like browsers and the global fetch of Node.js since Node 26. */
function http2Fetch(url, init) {
  return new Promise((resolve, reject) => {
    const { origin, pathname, search } = new URL(url);
    const session = http2.connect(origin);
    const fail = (error) => {
      session.destroy();
      reject(error);
    };
    session.on("error", fail);
    init.signal.addEventListener("abort", () => fail(init.signal.reason));
    const request = session.request({ ":path": pathname + search, ...init.headers, origin: ORIGIN });
    request.on("error", fail);
    request.on("response", (headers) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        session.close();
        resolve(toResponse(headers[":status"], headers, Buffer.concat(chunks)));
      });
    });
  });
}

/**
 * Checks the domains with the given fetch.
 * @returns The headers of all responses if all answers are as expected, otherwise null.
 */
async function check(endpoint, fetchImpl) {
  const headers = [];
  const checker = new dns.DnsChecker({
    endpoint,
    timeoutMs: 5000,
    cacheSize: 0,
    failureThreshold: Infinity,
    fetch: async (url, init) => {
      const response = await fetchImpl(url, init);
      headers.push(response.headers);
      return response;
    },
  });
  for (const [domain, reason] of EXPECTED_REASONS) {
    const result = await checker.check(domain);
    if (result.reason !== reason) {
      return null;
    }
  }
  return headers;
}

/** Checks twice before giving up, so a single timeout does not change the table. */
async function checkWithRetry(endpoint, fetchImpl) {
  return (await check(endpoint, fetchImpl)) ?? (await check(endpoint, fetchImpl));
}

function allowsOrigin(headers) {
  const allowed = headers.get("access-control-allow-origin");
  return allowed === "*" || allowed === ORIGIN;
}

/**
 * Checks the CORS header over HTTP/3, which browsers switch to if the resolver advertises it.
 * @returns Whether the origin is allowed, or null if HTTP/3 does not work (browsers then stay on HTTP/2).
 */
async function http3AllowsOrigin(endpoint) {
  const query = Buffer.from(dns.encodeQuery("gmail.com", dns.DNS_TYPE_MX)).toString("base64url");
  try {
    const { stdout } = await execFileAsync("curl", [
      "--silent", "--show-error", "--http3-only", "--max-time", "10",
      "--dump-header", "-", "--output", "/dev/null",
      "--header", `Origin: ${ORIGIN}`, "--header", "Accept: application/dns-message",
      `${endpoint}?dns=${query}`,
    ]);
    const [statusLine, ...lines] = stdout.split("\r\n");
    const headers = new Headers();
    for (const line of lines) {
      const separator = line.indexOf(":");
      if (separator > 0) {
        headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      }
    }
    return statusLine.startsWith("HTTP/3 200") && allowsOrigin(headers);
  } catch {
    return null;
  }
}

async function testResolver({ name, endpoint }) {
  const http1 = await checkWithRetry(endpoint, http1Fetch);
  const http2 = await checkWithRetry(endpoint, http2Fetch);
  // Browsers prefer HTTP/2 and fall back to HTTP/1.1
  const browserHeaders = http2 ?? http1;
  let browser = browserHeaders !== null && browserHeaders.every(allowsOrigin);
  if (browser && browserHeaders.some((headers) => /\bh3=/.test(headers.get("alt-svc") ?? ""))) {
    browser = (await http3AllowsOrigin(endpoint)) !== false;
  }
  let node = "❌";
  if (http1) {
    node = "✅";
  } else if (http2) {
    node = "✅ Node 26+";
  }
  console.log(`${name}: HTTP/1.1 ${http1 ? "ok" : "failed"}, HTTP/2 ${http2 ? "ok" : "failed"}, browser ${browser ? "ok" : "failed"}`);
  return [name, `\`${endpoint}\``, browser ? "✅" : "❌", node];
}

/** Width of the text in a monospace font, emojis take two columns. */
function displayWidth(text) {
  return [...text].reduce((width, character) => width + (/\p{Extended_Pictographic}/u.test(character) ? 2 : 1), 0);
}

function formatTable(header, rows) {
  const widths = header.map((_, column) => Math.max(...[header, ...rows].map((row) => displayWidth(row[column]))));
  const formatRow = (row) => `| ${row.map((cell, column) => cell + " ".repeat(widths[column] - displayWidth(cell))).join(" | ")} |`;
  return [formatRow(header), `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`, ...rows.map(formatRow)];
}

async function assertCurlSupportsHttp3() {
  const { stdout } = await execFileAsync("curl", ["--version"]);
  if (!/^Features:.*\bHTTP3\b/m.test(stdout)) {
    throw new Error("curl with HTTP/3 support is required");
  }
}

(async () => {
  await assertCurlSupportsHttp3();
  const rows = await Promise.all(RESOLVERS.map(testResolver));
  const table = formatTable(["Resolver", "Endpoint", "Browser", "Node"], rows);
  const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  // The blank line ends the table, so the end marker is not read as a table row
  const generated = [`Public resolvers tested in ${month}:`, "", ...table, ""];

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const readmePath = path.resolve(__dirname, "../README.md");
  const lines = fs.readFileSync(readmePath, "utf8").split("\n");

  // Replace everything between the marker comments, keeping the markers
  const start = lines.findIndex((line) => line.startsWith(START_MARKER));
  const end = lines.findIndex((line) => line.startsWith(END_MARKER));
  if (start < 0 || end < start) {
    throw new Error(`Markers ${START_MARKER} and ${END_MARKER} not found in README.md`);
  }
  lines.splice(start + 1, end - start - 1, ...generated);
  const content = lines.join("\n");

  fs.writeFileSync(readmePath, content, "utf8");
  console.log(`Resolver table written to ${readmePath}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
