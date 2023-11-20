// Needed b/c Choicescript is an application w/a loose set of files rather than a library

// eslint-disable-next-line @typescript-eslint/no-var-requires
const terser = require('terser');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compareAsc = require('date-fns/compareAsc');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs/promises');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

// All paths relative to this file
const REL_SRC = "../choicescript/src";
const REL_OUT = "../choicescript/out";

const srcPath = path.resolve(__dirname, REL_SRC);
const outPath = path.resolve(__dirname, REL_OUT);


async function sourceIsNewer(srcFile, dstFile) {
	try {
		const dstStats = await fs.stat(dstFile);
		const srcStats = await fs.stat(srcFile);

		return (compareAsc(srcStats.mtime, dstStats.mtime) == 1);
	} catch (err) {
		if (err.code == "ENOENT") {
			return true;
		}
		throw(err);
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
	}
	else {
		await fs.copyFile(inFile, outFile);
	}
}

async function makeSourceDir() {
	try {
		await fs.mkdir(outPath);
	} catch (err) {
		if (err.code != "EEXIST") {
			throw(err);
		}
	}	
}



makeSourceDir();

fs.readdir(srcPath).then((files) => {
	files.forEach((filename) => processFile(filename, srcPath, outPath));
});
