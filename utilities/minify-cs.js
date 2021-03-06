// Needed b/c Choicescript is an application w/a loose set of files rather than a library

let terser = require('terser');
let compareAsc = require('date-fns/compareAsc');
let fs = require('fs/promises');
let path = require('path');

// All paths relative to this file
const REL_SRC = "../choicescript/src";
const REL_OUT = "../choicescript/out";


async function sourceIsNewer(srcFile, dstFile) {
	try {
		dstStats = await fs.stat(dstFile);
	} catch (err) {
		if (err.code == "ENOENT") {
			return true;
		}
		throw(err);
	}

	srcStats = await fs.stat(srcFile);

	return (compareAsc(srcStats.mtime, dstStats.mtime) == 1)
}


async function processFile(filename, srcPath, outPath) {
	let inFile = path.resolve(srcPath, filename);
	let outFile = path.resolve(outPath, filename);
	if (!(await sourceIsNewer(inFile, outFile))) {
		return;
	}

	console.log(`Processing ${filename}`);
	// Only minify js files
	if (inFile.match(/\.js$/)) {
		data = await fs.readFile(inFile, "utf8");
		mini = await terser.minify(data);
		await fs.writeFile(outFile, mini.code);
	}
	else {
		await fs.copyFile(inFile, outFile);
	}
}

async function makeSourceDir(dir) {
	try {
		await fs.mkdir(outPath);
	} catch (err) {
		if (err.code != "EEXIST") {
			throw(err);
		}
	}	
}



let srcPath = path.resolve(__dirname, REL_SRC);
let outPath = path.resolve(__dirname, REL_OUT);

makeSourceDir()

fs.readdir(srcPath).then((files) => {
	files.forEach((filename) => processFile(filename, srcPath, outPath));
});
