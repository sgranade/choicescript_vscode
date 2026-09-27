import * as esbuild from "esbuild";
import * as fs from "fs/promises";
import * as path from "path";

const csSrcDir = path.resolve(import.meta.dirname, "choicescript/src");
const csOutDir = path.resolve(import.meta.dirname, "dist/choicescript");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: "esbuild-problem-matcher",

    setup(build) {
        build.onStart(() => {
            console.log("[watch] build started");
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(
                    `    ${location.file}:${location.line}:${location.column}:`,
                );
            });
            console.log("[watch] build finished");
        });
    },
};

const commonOptions = {
    bundle: true,
    external: ["vscode"],
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: "silent",
    resolveExtensions: [".ts", ".js"],
    plugins: [esbuildProblemMatcherPlugin],
};

const nodeOptions = {
    ...commonOptions,
    platform: "node",
    target: "node24",
    format: "cjs",
};

const webOptions = {
    ...commonOptions,
    platform: "browser",
    target: "esnext",
    alias: {
        path: "path-browserify",
    },
};

const builds = [
    {
        ...nodeOptions,
        entryPoints: ["client/src/node/extension.ts"],
        outfile: "dist/client/node/extension.js",
    },
    {
        ...webOptions,
        entryPoints: ["client/src/web/extension.ts"],
        outfile: "dist/client/web/extension.js",
        format: "cjs",
    },
    {
        ...nodeOptions,
        entryPoints: ["server/src/node/server.ts"],
        outfile: "dist/server/node/server.js",
    },
    {
        ...webOptions,
        entryPoints: ["server/src/web/server.ts"],
        outfile: "dist/server/web/server.js",
        format: "iife", // maybe? need to check
        globalName: "serverExportVar",
    },
];

async function main() {
    // We're going to build ChoiceScript once and not
    // watch it, since it's very static
    await buildChoiceScript();

    if (watch) {
        const contexts = await Promise.all(
            builds.map((opts) => esbuild.context(opts)),
        );
        await Promise.all(contexts.map((ctx) => ctx.watch()));
    } else {
        await Promise.all(builds.map((opts) => esbuild.build(opts)));
    }
}

async function buildChoiceScript() {
    await fs.mkdir(csOutDir, { recursive: true });
    const files = await fs.readdir(csSrcDir);

    const jsFiles = files.filter((f) => f.endsWith(".js"));
    const otherFiles = files.filter((f) => !f.endsWith(".js"));

    await Promise.all([
        jsFiles.length
            ? esbuild.build({
                  entryPoints: jsFiles.map((f) => path.join(csSrcDir, f)),
                  outdir: csOutDir,
                  bundle: false,
                  minify: production,
                  logLevel: "silent",
              })
            : Promise.resolve(),
        ...otherFiles.map((f) =>
            fs.copyFile(path.join(csSrcDir, f), path.join(csOutDir, f)),
        ),
    ]);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
