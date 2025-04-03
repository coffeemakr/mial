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

  console.log(tlds);

  // Correctly derive __dirname for ES modules
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Write TLDs to a file as a JavaScript module
  const outputPath = path.resolve(__dirname, "../tlds.js");
  const versionComment = version ? `// Version: ${version}\n` : "";
const fileContent = `${versionComment}// Auto-generated file\nexport const tlds = ${JSON.stringify(
    tlds
)};\n`;
  fs.writeFileSync(outputPath, fileContent, "utf8");
  console.log(`TLDs written to ${outputPath}`);
})();
