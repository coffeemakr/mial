import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

async function fetchTLDs() {
  return new Promise((resolve, reject) => {
    https
      .get("https://data.iana.org/TLD/tlds-alpha-by-domain.txt", (res) => {
        let data = "";

        // Collect data chunks
        res.on("data", (chunk) => {
          data += chunk;
        });

        // Process data when fully received
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Error fetching TLDs: HTTP ${res.statusCode}`));
            return;
          }
          const lines = data.split("\n");
          resolve(lines);
        });
      })
      .on("error", (err) => {
        reject(new Error(`Error fetching TLDs: ${err.message}`));
      });
  });
}

(async () => {
  // Fetch TLDs from IANA
  let tlds = await fetchTLDs();

  // Find the version comment and extract the version number
  const versionIndex = tlds.findIndex((line) => line.startsWith("# Version"));
  let version = null;
  if (versionIndex !== -1) {
    const versionLine = tlds[versionIndex];
    const versionMatch = versionLine.match(/# Version\s+(\d+)/);
    if (versionMatch) {
      version = versionMatch[1];
    }
  }

  console.log(`Version: ${version}`);

  // Remove comments by splitting lines
  tlds = tlds.map((line) => line.split("#")[0]);
  // Trim lines
  tlds = tlds.map((line) => line.trim());
  // Remove empty lines
  tlds = tlds.filter((line) => line.length > 0);
  // Lowercase all TLDs
  tlds = tlds.map((line) => line.toLowerCase());
  // Deduplicate and sort, so the committed file only changes when the list does
  tlds = [...new Set(tlds)].sort();

  // Refuse to overwrite the list with something that is not a TLD list
  const invalid = tlds.filter((tld) => !/^[a-z0-9-]+$/.test(tld));
  if (tlds.length === 0 || invalid.length > 0) {
    throw new Error(`Unexpected TLD list: ${JSON.stringify(invalid.slice(0, 5))}`);
  }

  console.log(tlds);

  // Correctly derive __dirname for ES modules
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Write TLDs to a file as a JavaScript module, one TLD per line.
  // The version is left out of the file, as it changes daily even when the list does not.
  const outputPath = path.resolve(__dirname, "../tlds.js");
  const fileContent = `// Auto-generated file\nexport const tlds = [\n${tlds
    .map((tld) => `  ${JSON.stringify(tld)},\n`)
    .join("")}];\n`;
  fs.writeFileSync(outputPath, fileContent, "utf8");
  console.log(`TLDs written to ${outputPath}`);

  // Expose the version to GitHub Actions
  if (process.env.GITHUB_OUTPUT && version) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
