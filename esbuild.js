const esbuild = require("esbuild");
const fs = require("fs/promises");
const path = require("path");

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
        outfile: "client/dist/node/extension.js",
    },
    {
        ...webOptions,
        entryPoints: ["client/src/web/extension.ts"],
        outfile: "client/dist/web/extension.js",
        format: "cjs",
    },
    {
        ...nodeOptions,
        entryPoints: ["server/src/node/server.ts"],
        outfile: "server/dist/node/server.js",
    },
    {
        ...webOptions,
        entryPoints: ["server/src/web/server.ts"],
        outfile: "server/dist/web/server.js",
        format: "iife", // maybe? need to check
        globalName: "serverExportVar",
    },
];

async function main() {
    if (watch) {
        const contexts = await Promise.all(
            builds.map((opts) => esbuild.context(opts)),
        );
        await Promise.all(contexts.map((ctx) => ctx.watch()));
    } else {
        await Promise.all(builds.map((opts) => esbuild.build(opts)));
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
