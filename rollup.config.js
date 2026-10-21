import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
export default { input: "src/worker.js", output: { file: "worker.js", format: "es", inlineDynamicImports: true }, plugins: [resolve({ browser: true }), commonjs(), json()] };
