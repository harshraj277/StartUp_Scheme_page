/* Runs every suite. Usage: node tests/run-tests.js  (or: npm test) */
const { spawnSync } = require("child_process");
const path = require("path");

const SUITES = ["engine.test.js", "contract.test.js", "e2e.test.js", "compare.test.js"];
let failed = 0;

for (const s of SUITES) {
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: "inherit" });
  if (r.status !== 0) failed++;
}

console.log("\n" + "=".repeat(52));
if (failed) {
  console.log(`RESULT: ${failed} of ${SUITES.length} suite(s) FAILED`);
  process.exit(1);
}
console.log(`RESULT: all ${SUITES.length} suites passed`);
