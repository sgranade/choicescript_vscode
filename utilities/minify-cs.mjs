// Needed b/c Choicescript is an application w/a loose set of files rather than a library

import { compareAsc } from "date-fns";
import * as fs from "fs/promises";
import * as path from "path";
import * as terser from "terser";

// All paths relative to this file
const REL_SRC = "../choicescript/src";
const REL_OUT = "../choicescript/out";

const srcPath = path.resolve(import.meta.dirname, REL_SRC);
const outPath = path.resolve(import.meta.dirname, REL_OUT);

async function sourceIsNewer(srcFile, dstFile) {
    try {
        const dstStats = await fs.stat(dstFile);
        const srcStats = await fs.stat(srcFile);

        return compareAsc(srcStats.mtime, dstStats.mtime) == 1;
    } catch (err) {
        if (err.code == "ENOENT") {
            return true;
        }
        throw err;
    }
}

async function processFile(filename, srcPath, outPath) {
    const inFile = path.resolve(srcPath, filename);
    const outFile = path.resolve(outPath, filename);
    if (!(await sourceIsNewer(inFile, outFile))) {
        return;
    }

    console.log(`Processing ${filename}`);
    // Only minify js files
    if (inFile.match(/\.js$/)) {
        const data = await fs.readFile(inFile, "utf8");
        const mini = await terser.minify(data);
        await fs.writeFile(outFile, mini.code);
    } else {
        await fs.copyFile(inFile, outFile);
    }
}

async function makeSourceDir() {
    try {
        await fs.mkdir(outPath);
    } catch (err) {
        if (err.code != "EEXIST") {
            throw err;
        }
    }
}

makeSourceDir();

fs.readdir(srcPath).then((files) => {
    files.forEach((filename) => processFile(filename, srcPath, outPath));
});
